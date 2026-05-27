/**
 * _shared.resolve.test.ts — resolveActiveCredential の単体テスト。
 *
 * 認証情報の解決優先順位 (環境変数 > プロファイル > デフォルト) を検証する。
 * キーチェーン呼び出しは InMemoryCredentialStore で代替し、OS 依存を排除する。
 * 設定ファイル操作は一時ディレクトリで代替し、ファイルシステム依存を排除する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CommonArgs } from "@/commands/_shared"
import { resolveActiveCredential } from "@/commands/_shared"
import type { Credential } from "@/core/auth/credential"
import { InMemoryCredentialStore } from "@/core/auth/credential-store"

// テスト用フィクスチャ
const VALID_SID = "s%3AabcDEF123456789012345678901234567890"
const VALID_PAT = `pat_${"a".repeat(64)}`
const VALID_SA_KEY = `cs_${"b".repeat(64)}`

/** テスト用デフォルト CommonArgs を生成するヘルパー */
function makeArgs(overrides: Partial<CommonArgs> = {}): CommonArgs {
  return {
    json: false,
    plain: false,
    "results-only": false,
    quiet: false,
    ...overrides,
  }
}

describe("resolveActiveCredential — 環境変数 COS_PERSONAL_ACCESS_TOKEN", () => {
  let exitMock: ReturnType<typeof spyOn>
  let stdoutMock: ReturnType<typeof spyOn>

  beforeEach(() => {
    exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
  })

  afterEach(() => {
    exitMock.mockRestore()
    stdoutMock.mockRestore()
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
  })

  it("有効な PAT が設定されている場合 PAT Credential を返す", async () => {
    process.env["COS_PERSONAL_ACCESS_TOKEN"] = VALID_PAT
    const store = new InMemoryCredentialStore()

    const cred = await resolveActiveCredential(makeArgs(), store)

    expect(cred.kind).toBe("pat")
    expect(cred.value).toBe(VALID_PAT)
  })

  it("COS_PERSONAL_ACCESS_TOKEN が COS_SID より優先される", async () => {
    process.env["COS_PERSONAL_ACCESS_TOKEN"] = VALID_PAT
    process.env["COS_SID"] = VALID_SID
    const store = new InMemoryCredentialStore()

    const cred = await resolveActiveCredential(makeArgs(), store)

    expect(cred.kind).toBe("pat")
  })

  it("不正な PAT が設定されている場合は exit 5 で終了する", async () => {
    process.env["COS_PERSONAL_ACCESS_TOKEN"] = "不正なPATフォーマット"
    const store = new InMemoryCredentialStore()

    try {
      await resolveActiveCredential(makeArgs(), store)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("INVALID_PERSONAL_ACCESS_TOKEN")
  })
})

describe("resolveActiveCredential — 環境変数 COS_SERVICE_ACCOUNT_KEY", () => {
  let exitMock: ReturnType<typeof spyOn>
  let stdoutMock: ReturnType<typeof spyOn>

  beforeEach(() => {
    exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
    Reflect.deleteProperty(process.env, "COS_PROJECT")
  })

  afterEach(() => {
    exitMock.mockRestore()
    stdoutMock.mockRestore()
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
    Reflect.deleteProperty(process.env, "COS_PROJECT")
  })

  it("有効な SA Key + COS_PROJECT が設定されている場合 SA Credential を返す", async () => {
    process.env["COS_SERVICE_ACCOUNT_KEY"] = VALID_SA_KEY
    process.env["COS_PROJECT"] = "作業プロジェクト"
    const store = new InMemoryCredentialStore()

    const cred = await resolveActiveCredential(makeArgs(), store)

    expect(cred.kind).toBe("sa")
    expect(cred.value).toBe(VALID_SA_KEY)
  })

  it("COS_SERVICE_ACCOUNT_KEY が COS_SID より優先される", async () => {
    process.env["COS_SERVICE_ACCOUNT_KEY"] = VALID_SA_KEY
    process.env["COS_PROJECT"] = "作業プロジェクト"
    process.env["COS_SID"] = VALID_SID
    const store = new InMemoryCredentialStore()

    const cred = await resolveActiveCredential(makeArgs(), store)

    expect(cred.kind).toBe("sa")
  })
})

describe("resolveActiveCredential — 環境変数 COS_SID", () => {
  let exitMock: ReturnType<typeof spyOn>
  let stdoutMock: ReturnType<typeof spyOn>
  let stderrMock: ReturnType<typeof spyOn>

  beforeEach(() => {
    exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
  })

  afterEach(() => {
    exitMock.mockRestore()
    stdoutMock.mockRestore()
    stderrMock.mockRestore()
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
  })

  it("有効な SID が設定されている場合 SID Credential を返す", async () => {
    process.env["COS_SID"] = VALID_SID
    const store = new InMemoryCredentialStore()

    const cred = await resolveActiveCredential(makeArgs(), store)

    expect(cred.kind).toBe("sid")
    expect(cred.value).toBe(VALID_SID)
  })

  it("COS_SID に PAT を設定した場合は exit 5 + INVALID_SID で終了する (Phase 6 hard error)", async () => {
    // Phase 6: COS_SID に PAT を設定することは禁止。互換モードを廃止して hard error に変更。
    process.env["COS_SID"] = VALID_PAT
    const store = new InMemoryCredentialStore()

    try {
      await resolveActiveCredential(makeArgs(), store)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("INVALID_SID")
  })
})

describe("resolveActiveCredential — keychain (CredentialStore) からの解決", () => {
  let exitMock: ReturnType<typeof spyOn>
  let stdoutMock: ReturnType<typeof spyOn>

  beforeEach(() => {
    exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
    Reflect.deleteProperty(process.env, "COS_PROFILE")
  })

  afterEach(() => {
    exitMock.mockRestore()
    stdoutMock.mockRestore()
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
    Reflect.deleteProperty(process.env, "COS_PROFILE")
  })

  it("--profile で指定したプロファイルの Credential を取得できる", async () => {
    const store = new InMemoryCredentialStore()
    const sidCred: Credential = { kind: "sid", value: VALID_SID }
    await store.save("仕事用", sidCred)

    const cred = await resolveActiveCredential(makeArgs({ profile: "仕事用" }), store)

    expect(cred.kind).toBe("sid")
    expect(cred.value).toBe(VALID_SID)
  })

  it("プロファイル指定なしのとき default プロファイルを参照する", async () => {
    const store = new InMemoryCredentialStore()
    const patCred: Credential = { kind: "pat", value: VALID_PAT }
    await store.save("default", patCred)

    const cred = await resolveActiveCredential(makeArgs(), store)

    expect(cred.kind).toBe("pat")
    expect(cred.value).toBe(VALID_PAT)
  })

  it("keychain にも認証情報がない場合は exit 2 + AUTH_REQUIRED で終了する", async () => {
    const store = new InMemoryCredentialStore()

    try {
      await resolveActiveCredential(makeArgs(), store)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(2)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("AUTH_REQUIRED")
  })

  it("PAT Credential が保存されたプロファイルを正しく読み出せる", async () => {
    const store = new InMemoryCredentialStore()
    const patCred: Credential = { kind: "pat", value: VALID_PAT }
    await store.save("個人PAT", patCred)

    const cred = await resolveActiveCredential(makeArgs({ profile: "個人PAT" }), store)

    expect(cred.kind).toBe("pat")
    expect(cred.value).toBe(VALID_PAT)
  })

  it("COS_PROFILE env が --profile フラグ未指定のとき参照される (stage 5)", async () => {
    // COS_PROFILE 環境変数に "仕事用PAT" を設定し、そのプロファイルが参照されることを確認する
    process.env["COS_PROFILE"] = "仕事用PAT"
    const store = new InMemoryCredentialStore()
    const patCred: Credential = { kind: "pat", value: VALID_PAT }
    await store.save("仕事用PAT", patCred)

    const cred = await resolveActiveCredential(makeArgs(), store)

    expect(cred.kind).toBe("pat")
    expect(cred.value).toBe(VALID_PAT)
  })

  it("--profile フラグが COS_PROFILE env より優先される (stage 4 > stage 5)", async () => {
    // --profile フラグで "仕事用SID" を指定し、COS_PROFILE で "仕事用PAT" が設定されていても
    // --profile フラグが優先されることを確認する
    process.env["COS_PROFILE"] = "仕事用PAT"
    const store = new InMemoryCredentialStore()
    await store.save("仕事用SID", { kind: "sid", value: VALID_SID })
    await store.save("仕事用PAT", { kind: "pat", value: VALID_PAT })

    const cred = await resolveActiveCredential(makeArgs({ profile: "仕事用SID" }), store)

    expect(cred.kind).toBe("sid")
    expect(cred.value).toBe(VALID_SID)
  })
})

describe("resolveActiveCredential — config.defaultProfile からの解決 (stage 6)", () => {
  let exitMock: ReturnType<typeof spyOn>
  let stdoutMock: ReturnType<typeof spyOn>
  let tmpDir: string
  let configPath: string

  beforeEach(() => {
    exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
    Reflect.deleteProperty(process.env, "COS_PROFILE")
    // 一時設定ファイルの作成
    tmpDir = join(
      tmpdir(),
      `coscli-resolve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })
    configPath = join(tmpDir, "config.json5")
  })

  afterEach(() => {
    exitMock.mockRestore()
    stdoutMock.mockRestore()
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
    Reflect.deleteProperty(process.env, "COS_PROFILE")
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("config.defaultProfile が設定されていれば --profile / COS_PROFILE 未指定時に参照される (stage 6)", async () => {
    // config.defaultProfile = "設定ファイルデフォルト" のプロファイルが参照されることを確認する
    writeFileSync(configPath, JSON.stringify({ defaultProfile: "設定ファイルデフォルト" }))
    const store = new InMemoryCredentialStore()
    await store.save("設定ファイルデフォルト", { kind: "sid", value: VALID_SID })

    const cred = await resolveActiveCredential(makeArgs(), store, configPath)

    expect(cred.kind).toBe("sid")
    expect(cred.value).toBe(VALID_SID)
  })

  it("COS_PROFILE env が config.defaultProfile より優先される (stage 5 > stage 6)", async () => {
    // COS_PROFILE = "環境変数プロファイル" が設定されていると、
    // config.defaultProfile = "設定ファイルデフォルト" より優先されることを確認する
    writeFileSync(configPath, JSON.stringify({ defaultProfile: "設定ファイルデフォルト" }))
    process.env["COS_PROFILE"] = "環境変数プロファイル"
    const store = new InMemoryCredentialStore()
    await store.save("環境変数プロファイル", { kind: "pat", value: VALID_PAT })
    await store.save("設定ファイルデフォルト", { kind: "sid", value: VALID_SID })

    const cred = await resolveActiveCredential(makeArgs(), store, configPath)

    expect(cred.kind).toBe("pat")
    expect(cred.value).toBe(VALID_PAT)
  })

  it("config.defaultProfile も未設定の場合は 'default' プロファイルにフォールバックする (stage 7)", async () => {
    // config.defaultProfile が設定されていない場合は 'default' プロファイルを参照する
    writeFileSync(configPath, JSON.stringify({}))
    const store = new InMemoryCredentialStore()
    await store.save("default", { kind: "sid", value: VALID_SID })

    const cred = await resolveActiveCredential(makeArgs(), store, configPath)

    expect(cred.kind).toBe("sid")
    expect(cred.value).toBe(VALID_SID)
  })
})
