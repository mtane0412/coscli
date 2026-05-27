/**
 * add.test.ts — `cos auth add` コマンドのユニットテスト。
 *
 * API 検証なしでキーチェーンに認証情報を直接保存する動作を検証する。
 * キーチェーンは InMemoryCredentialStore で代替し、設定ファイルは一時ディレクトリで代替する。
 * readStdinBounded は spyOn でモックして標準入力依存を排除する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAuthAddCommand } from "@/commands/auth/add"
import { InMemoryCredentialStore } from "@/core/auth/credential-store"
import { loadConfig } from "@/infra/config"
import * as safeRead from "@/infra/safe-read"

// テスト用フィクスチャ
const VALID_SID = "s%3AabcDEF123456789012345678901234567890"
const VALID_PAT = `pat_${"a".repeat(64)}`
const VALID_SA_KEY = `cs_${"b".repeat(64)}`

// ---------------------------------------------------------------------------
// 一時設定ファイル管理
// ---------------------------------------------------------------------------

let tmpDir: string
let configPath: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `coscli-add-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
  configPath = join(tmpDir, "config.json5")
  writeFileSync(configPath, JSON.stringify({}))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// テスト前後処理 (process.exit / stdout / env のモック)
// ---------------------------------------------------------------------------

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  // 環境変数のリセット
  Reflect.deleteProperty(process.env, "TEST_KEY_ENV")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "TEST_KEY_ENV")
})

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

type AddArgs = Record<string, unknown>

async function runAdd(args: AddArgs, credStore: InMemoryCredentialStore) {
  const command = createAuthAddCommand({ configPath, createCredStore: () => credStore })
  await (command.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

const baseArgs: AddArgs = {
  json: false,
  plain: false,
  quiet: false,
  verbose: undefined,
  profile: undefined,
  project: undefined,
  "results-only": false,
  select: undefined,
  "enable-commands": undefined,
  "disable-commands": undefined,
  type: undefined,
  key: undefined,
  "key-env": undefined,
  "key-stdin": false,
  "set-default": false,
}

// ---------------------------------------------------------------------------
// テストケース: SID の保存
// ---------------------------------------------------------------------------

describe("authAddCommand — SID の保存", () => {
  it("--type sid --key <raw> で SID Credential が 'default' プロファイルに保存される", async () => {
    const credStore = new InMemoryCredentialStore()

    await runAdd({ ...baseArgs, type: "sid", key: VALID_SID }, credStore)

    const saved = await credStore.load("default")
    expect(saved).not.toBeNull()
    expect(saved?.kind).toBe("sid")
    expect(saved?.value).toBe(VALID_SID)
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("--type sid --key <raw> --profile 仕事用SID で指定プロファイルに保存される", async () => {
    const credStore = new InMemoryCredentialStore()

    await runAdd({ ...baseArgs, type: "sid", key: VALID_SID, profile: "仕事用SID" }, credStore)

    const saved = await credStore.load("仕事用SID")
    expect(saved).not.toBeNull()
    expect(saved?.kind).toBe("sid")
    expect(saved?.value).toBe(VALID_SID)
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("不正な SID フォーマット → exit 5 + INVALID_SID", async () => {
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd({ ...baseArgs, type: "sid", key: "不正なSIDフォーマット\n改行あり" }, credStore)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("INVALID_SID")
  })
})

// ---------------------------------------------------------------------------
// テストケース: PAT の保存
// ---------------------------------------------------------------------------

describe("authAddCommand — PAT の保存", () => {
  it("--type pat --key <raw> で PAT Credential が 'default' プロファイルに保存される", async () => {
    const credStore = new InMemoryCredentialStore()

    await runAdd({ ...baseArgs, type: "pat", key: VALID_PAT }, credStore)

    const saved = await credStore.load("default")
    expect(saved).not.toBeNull()
    expect(saved?.kind).toBe("pat")
    expect(saved?.value).toBe(VALID_PAT)
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("不正な PAT フォーマット → exit 5 + INVALID_PERSONAL_ACCESS_TOKEN", async () => {
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd({ ...baseArgs, type: "pat", key: "pat_短すぎる" }, credStore)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("INVALID_PERSONAL_ACCESS_TOKEN")
  })
})

// ---------------------------------------------------------------------------
// テストケース: SA Key の保存
// ---------------------------------------------------------------------------

describe("authAddCommand — SA Key の保存", () => {
  it("--type sa --key <raw> --project テストプロジェクト で SA Credential が保存される", async () => {
    const credStore = new InMemoryCredentialStore()

    await runAdd(
      { ...baseArgs, type: "sa", key: VALID_SA_KEY, project: "テストプロジェクト" },
      credStore,
    )

    const saved = await credStore.load("default")
    expect(saved).not.toBeNull()
    expect(saved?.kind).toBe("sa")
    expect(saved?.value).toBe(VALID_SA_KEY)
    expect(saved?.defaultProject).toBe("テストプロジェクト")
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("--type sa で --project 未指定 → exit 5 + VALIDATION_ERROR", async () => {
    // SA Key には必ず --project が必要
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd({ ...baseArgs, type: "sa", key: VALID_SA_KEY }, credStore)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("VALIDATION_ERROR")
  })

  it("不正な SA Key フォーマット → exit 5 + INVALID_SERVICE_ACCOUNT_KEY", async () => {
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd(
        { ...baseArgs, type: "sa", key: "cs_短すぎる", project: "テストプロジェクト" },
        credStore,
      )
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("INVALID_SERVICE_ACCOUNT_KEY")
  })
})

// ---------------------------------------------------------------------------
// テストケース: --key-env <ENV> による値の取得
// ---------------------------------------------------------------------------

describe("authAddCommand — --key-env による値取得", () => {
  it("--key-env TEST_KEY_ENV で環境変数から SID を取得して保存される", async () => {
    // 環境変数名を渡し、その変数の値が使われることを確認する
    process.env["TEST_KEY_ENV"] = VALID_SID
    const credStore = new InMemoryCredentialStore()

    await runAdd({ ...baseArgs, type: "sid", "key-env": "TEST_KEY_ENV" }, credStore)

    const saved = await credStore.load("default")
    expect(saved).not.toBeNull()
    expect(saved?.kind).toBe("sid")
    expect(saved?.value).toBe(VALID_SID)
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("--key-env で指定した環境変数が未設定 → exit 5 + VALIDATION_ERROR", async () => {
    // MISSING_ENV_VAR は設定されていない
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd({ ...baseArgs, type: "sid", "key-env": "MISSING_ENV_VAR" }, credStore)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("VALIDATION_ERROR")
  })
})

// ---------------------------------------------------------------------------
// テストケース: --key-stdin による値の取得
// ---------------------------------------------------------------------------

describe("authAddCommand — --key-stdin による値取得", () => {
  it("--key-stdin で stdin から SID を読み込んで保存される", async () => {
    // readStdinBounded をモックして標準入力を模擬する
    const stdinMock = spyOn(safeRead, "readStdinBounded").mockImplementation(() => `${VALID_SID}\n`)
    const credStore = new InMemoryCredentialStore()

    await runAdd({ ...baseArgs, type: "sid", "key-stdin": true }, credStore)

    const saved = await credStore.load("default")
    expect(saved).not.toBeNull()
    expect(saved?.kind).toBe("sid")
    expect(saved?.value).toBe(VALID_SID)
    expect(exitMock).not.toHaveBeenCalled()

    stdinMock.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// テストケース: 入力モード排他チェック
// ---------------------------------------------------------------------------

describe("authAddCommand — 入力モード排他チェック", () => {
  it("--key と --key-env を同時指定 → exit 5 + VALIDATION_ERROR", async () => {
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd(
        { ...baseArgs, type: "sid", key: VALID_SID, "key-env": "TEST_KEY_ENV" },
        credStore,
      )
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("VALIDATION_ERROR")
  })

  it("--key と --key-stdin を同時指定 → exit 5 + VALIDATION_ERROR", async () => {
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd({ ...baseArgs, type: "sid", key: VALID_SID, "key-stdin": true }, credStore)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("VALIDATION_ERROR")
  })

  it("--key-env と --key-stdin を同時指定 → exit 5 + VALIDATION_ERROR", async () => {
    process.env["TEST_KEY_ENV"] = VALID_SID
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd(
        { ...baseArgs, type: "sid", "key-env": "TEST_KEY_ENV", "key-stdin": true },
        credStore,
      )
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("VALIDATION_ERROR")
  })

  it("入力モードなし → exit 5 + VALIDATION_ERROR (non-interactive のみ対応)", async () => {
    const credStore = new InMemoryCredentialStore()

    try {
      await runAdd({ ...baseArgs, type: "sid" }, credStore)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("VALIDATION_ERROR")
  })
})

// ---------------------------------------------------------------------------
// テストケース: --set-default
// ---------------------------------------------------------------------------

describe("authAddCommand — --set-default", () => {
  it("--set-default で config.defaultProfile が更新される", async () => {
    const credStore = new InMemoryCredentialStore()

    await runAdd(
      {
        ...baseArgs,
        type: "sid",
        key: VALID_SID,
        profile: "新しいデフォルト",
        "set-default": true,
      },
      credStore,
    )

    const config = loadConfig(configPath)
    expect(config.defaultProfile).toBe("新しいデフォルト")
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("--set-default なしでは config.defaultProfile は変更されない", async () => {
    const credStore = new InMemoryCredentialStore()

    await runAdd({ ...baseArgs, type: "sid", key: VALID_SID, profile: "変更なし" }, credStore)

    const config = loadConfig(configPath)
    expect(config.defaultProfile).toBeUndefined()
    expect(exitMock).not.toHaveBeenCalled()
  })
})
