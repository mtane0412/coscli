/**
 * _shared.resolve.test.ts — resolveActiveCredential の単体テスト。
 *
 * 認証情報の解決優先順位 (環境変数 > プロファイル > デフォルト) を検証する。
 * キーチェーン呼び出しは InMemoryCredentialStore で代替し、OS 依存を排除する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
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

  it("COS_SID に PAT を設定した場合は PAT Credential を返す (互換モード: stderr 警告あり)", async () => {
    // COS_PERSONAL_ACCESS_TOKEN への移行を促すが、PAT として動作させる互換動作
    process.env["COS_SID"] = VALID_PAT
    const store = new InMemoryCredentialStore()

    const cred = await resolveActiveCredential(makeArgs(), store)

    // 警告を出して PAT として処理 (Phase 6 で hard error に切り替え)
    expect(cred.kind).toBe("pat")
    const stderrOutput = (stderrMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stderrOutput).toContain("COS_PERSONAL_ACCESS_TOKEN")
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
  })

  afterEach(() => {
    exitMock.mockRestore()
    stdoutMock.mockRestore()
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
    Reflect.deleteProperty(process.env, "COS_SID")
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
})
