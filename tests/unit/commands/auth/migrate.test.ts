/**
 * migrate.test.ts — `cos auth migrate` コマンドのユニットテスト。
 *
 * config.serviceAccounts に保存された SA キーを keychain (CredentialStore) に移行する動作を検証する。
 * 設定ファイル操作は一時ディレクトリの config.json5 で代替し、
 * keychain は InMemoryCredentialStore で代替する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAuthMigrateCommand } from "@/commands/auth/migrate"
import { InMemoryCredentialStore } from "@/core/auth/credential-store"
import { loadConfig, loadLegacyServiceAccounts } from "@/infra/config"

// ---------------------------------------------------------------------------
// 一時設定ファイル管理
// ---------------------------------------------------------------------------

let tmpDir: string
let configPath: string

// テスト用 SA キー (cs_ + 64桁16進数)
const SA_KEY_ALPHA = "cs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const SA_KEY_BETA = "cs_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `coscli-migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(tmpDir, { recursive: true })
  configPath = join(tmpDir, "config.json5")
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// テスト前後処理
// ---------------------------------------------------------------------------

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
})

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** コマンドを実行するヘルパー。 */
async function runMigrate(args: Record<string, unknown>, credStore: InMemoryCredentialStore) {
  const command = createAuthMigrateCommand({
    configPath,
    createCredStore: () => credStore,
  })
  await (command.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

const defaultArgs = {
  json: false,
  plain: false,
  quiet: false,
  verbose: false,
  profile: undefined,
  "dry-run": false,
  "set-default": undefined,
  "results-only": false,
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("authMigrateCommand — 基本移行", () => {
  it("2 プロジェクト分の SA キーが keychain に移行され、config から削除されること", async () => {
    // 前提: config に 2 プロジェクトの SA キーが存在する
    writeFileSync(
      configPath,
      JSON.stringify({
        serviceAccounts: {
          アルファ事業: SA_KEY_ALPHA,
          ベータ事業: SA_KEY_BETA,
        },
      }),
    )
    const credStore = new InMemoryCredentialStore()

    await runMigrate(defaultArgs, credStore)

    // keychain に SA Credential が保存されていること
    const alphaProfile = "cs_アルファ事業"
    const betaProfile = "cs_ベータ事業"
    const alphaCred = await credStore.load(alphaProfile)
    const betaCred = await credStore.load(betaProfile)
    expect(alphaCred).not.toBeNull()
    expect(alphaCred?.kind).toBe("sa")
    expect(alphaCred?.value).toBe(SA_KEY_ALPHA)
    expect((alphaCred as { defaultProject?: string })?.defaultProject).toBe("アルファ事業")
    expect(betaCred).not.toBeNull()
    expect(betaCred?.kind).toBe("sa")
    expect(betaCred?.value).toBe(SA_KEY_BETA)

    // config から serviceAccounts が削除されていること
    const legacyAfter = loadLegacyServiceAccounts(configPath)
    expect(Object.keys(legacyAfter)).toHaveLength(0)
  })

  it("serviceAccounts が空の場合は何もせず正常終了すること", async () => {
    writeFileSync(configPath, JSON.stringify({ defaultProject: "テスト" }))
    const credStore = new InMemoryCredentialStore()

    await runMigrate(defaultArgs, credStore)

    expect(exitMock).not.toHaveBeenCalled()
  })
})

describe("authMigrateCommand — --dry-run", () => {
  it("--dry-run では keychain にも config にも変更が加わらないこと", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        serviceAccounts: {
          ガンマ事業: SA_KEY_ALPHA,
        },
      }),
    )
    const credStore = new InMemoryCredentialStore()

    await runMigrate({ ...defaultArgs, "dry-run": true }, credStore)

    // keychain に保存されていないこと
    const cred = await credStore.load("cs_ガンマ事業")
    expect(cred).toBeNull()

    // config が変更されていないこと (loadLegacyServiceAccounts で生の値を確認する)
    const legacyAccounts = loadLegacyServiceAccounts(configPath)
    expect(legacyAccounts["ガンマ事業"]).toBe(SA_KEY_ALPHA)
  })
})

describe("authMigrateCommand — プロファイル衝突", () => {
  it("keychain に既に同じプロファイルが存在する場合はスキップして警告を出すこと", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        serviceAccounts: {
          デルタ事業: SA_KEY_ALPHA,
        },
      }),
    )
    // 事前に同名プロファイルを keychain に保存する
    const credStore = new InMemoryCredentialStore()
    await credStore.save("cs_デルタ事業", {
      kind: "sa",
      value: SA_KEY_BETA,
      defaultProject: "デルタ事業",
    })

    await runMigrate(defaultArgs, credStore)

    // 既存の keychain 値が上書きされていないこと
    const cred = await credStore.load("cs_デルタ事業")
    expect(cred?.value).toBe(SA_KEY_BETA)

    // 警告が stderr に出ていること
    const stderrOutput = (stderrMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stderrOutput).toContain("デルタ事業")
    expect(stderrOutput).toContain("スキップ")
  })
})

describe("authMigrateCommand — --set-default", () => {
  it("--set-default <profile> で config.defaultProfile が更新されること", async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        serviceAccounts: {
          イプシロン事業: SA_KEY_ALPHA,
        },
      }),
    )
    const credStore = new InMemoryCredentialStore()

    await runMigrate({ ...defaultArgs, "set-default": "cs_イプシロン事業" }, credStore)

    const config = loadConfig(configPath)
    expect(config.defaultProfile).toBe("cs_イプシロン事業")
  })
})
