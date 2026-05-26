/**
 * use.test.ts — `cos auth use` コマンドのユニットテスト。
 *
 * config.defaultProfile を更新する動作を検証する。
 * 設定ファイル操作は一時ディレクトリで代替し、keychain は InMemoryCredentialStore で代替する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAuthUseCommand } from "@/commands/auth/use"
import { InMemoryCredentialStore } from "@/core/auth/credential-store"
import { loadConfig } from "@/infra/config"

// ---------------------------------------------------------------------------
// 一時設定ファイル管理
// ---------------------------------------------------------------------------

let tmpDir: string
let configPath: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `coscli-use-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
  configPath = join(tmpDir, "config.json5")
  writeFileSync(configPath, JSON.stringify({ defaultProject: "テスト" }))
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

async function runUse(args: Record<string, unknown>, credStore: InMemoryCredentialStore) {
  const command = createAuthUseCommand({ configPath, createCredStore: () => credStore })
  await (command.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

const baseArgs = {
  json: false,
  plain: false,
  quiet: false,
  verbose: false,
  profile: undefined,
  "results-only": false,
  unset: false,
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("authUseCommand — 基本動作", () => {
  it("存在するプロファイルを指定すると config.defaultProfile が更新されること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("work", { kind: "sid", value: "s%3Awork-sid-abc" })

    await runUse({ ...baseArgs, profile: "work" }, credStore)

    const config = loadConfig(configPath)
    expect(config.defaultProfile).toBe("work")
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("存在しないプロファイルを指定すると exit 4 (PROFILE_NOT_FOUND) になること", async () => {
    const credStore = new InMemoryCredentialStore()
    // work プロファイルは登録していない

    try {
      await runUse({ ...baseArgs, profile: "存在しないプロファイル" }, credStore)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(4)
  })
})

describe("authUseCommand — --unset", () => {
  it("--unset で config.defaultProfile が削除されること", async () => {
    // 事前に defaultProfile を設定しておく
    writeFileSync(configPath, JSON.stringify({ defaultProject: "テスト", defaultProfile: "work" }))
    const credStore = new InMemoryCredentialStore()

    await runUse({ ...baseArgs, unset: true }, credStore)

    const config = loadConfig(configPath)
    expect(config.defaultProfile).toBeUndefined()
    expect(exitMock).not.toHaveBeenCalled()
  })
})
