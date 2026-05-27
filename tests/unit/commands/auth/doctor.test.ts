/**
 * doctor.test.ts — `cos auth doctor` コマンドのユニットテスト。
 *
 * 全プロファイルのフォーマット検証と API 疎通確認の動作を検証する。
 * keychain は InMemoryCredentialStore で代替し、API クライアントはモック関数を注入する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { createAuthDoctorCommand } from "@/commands/auth/doctor"
import { AuthError } from "@/core/api/rest"
import type { Credential } from "@/core/auth/credential"
import { InMemoryCredentialStore } from "@/core/auth/credential-store"
import { ZodError, ZodIssueCode } from "zod"

// ---------------------------------------------------------------------------
// テスト前後処理
// ---------------------------------------------------------------------------

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock?.mockRestore()
  stderrMock.mockRestore()
})

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function capturePlainOutput(): () => string {
  const chunks: string[] = []
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => chunks.join("")
}

function captureJsonOutput(): () => unknown {
  const chunks: string[] = []
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => JSON.parse(chunks.join(""))
}

/** 常に成功する API クライアントを返す。 */
function successClient() {
  return { getMe: async () => ({ id: "user123", name: "テストユーザー" }) }
}

/** 常に AuthError を返す API クライアントを返す。 */
function unauthorizedClient() {
  return {
    getMe: async (): Promise<never> => {
      throw new AuthError()
    },
  }
}

/** 常にネットワークエラーを返す API クライアントを返す。 */
function networkErrorClient() {
  return {
    getMe: async (): Promise<never> => {
      throw new Error("fetch failed: network error")
    },
  }
}

async function runDoctor(
  args: Record<string, unknown>,
  credStore: InMemoryCredentialStore,
  createClient?: (_cred: Credential) => { getMe: () => Promise<unknown> },
) {
  const command = createAuthDoctorCommand({
    createCredStore: () => credStore,
    ...(createClient !== undefined && { createClient }),
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
  "results-only": false,
  offline: false,
}

// ---------------------------------------------------------------------------
// テストケース: フォーマット検証（既存の挙動）
// ---------------------------------------------------------------------------

describe("authDoctorCommand — 全プロファイル正常", () => {
  it("全プロファイルが OK の場合は exit しないこと", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid" })
    await credStore.save("work", { kind: "pat", value: `pat_${"a".repeat(64)}` })

    const getPlain = capturePlainOutput()
    // API ping は successClient で必ず成功させる
    await runDoctor(defaultArgs, credStore, () => successClient())
    const output = getPlain()

    expect(exitMock).not.toHaveBeenCalled()
    expect(output).toContain("default")
    expect(output).toContain("work")
  })
})

describe("authDoctorCommand — プロファイルなし", () => {
  it("プロファイルが空の場合は正常終了すること", async () => {
    const credStore = new InMemoryCredentialStore()

    const getPlain = capturePlainOutput()
    await runDoctor(defaultArgs, credStore, () => successClient())
    const output = getPlain()

    expect(exitMock).not.toHaveBeenCalled()
    expect(output).toContain("登録済みのプロファイルはありません")
  })
})

describe("authDoctorCommand — --json 出力", () => {
  it("JSON 出力に profiles 配列が含まれること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid" })

    const getJson = captureJsonOutput()
    await runDoctor({ ...defaultArgs, json: true }, credStore, () => successClient())
    const output = getJson() as { data?: { profiles: unknown[] } }

    expect(output.data?.profiles).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// テストケース: API 疎通確認（新機能）
// ---------------------------------------------------------------------------

describe("authDoctorCommand — API ping 成功", () => {
  it("getMe が成功した場合はプロファイルが ok になること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid" })

    const getPlain = capturePlainOutput()
    await runDoctor(defaultArgs, credStore, () => successClient())
    const output = getPlain()

    expect(exitMock).not.toHaveBeenCalled()
    expect(output).toContain("✓ default")
  })

  it("PAT プロファイルの getMe が成功した場合も ok になること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("readonly", { kind: "pat", value: `pat_${"b".repeat(64)}` })

    const getPlain = capturePlainOutput()
    await runDoctor(defaultArgs, credStore, () => successClient())
    const output = getPlain()

    expect(exitMock).not.toHaveBeenCalled()
    expect(output).toContain("✓ readonly")
  })
})

describe("authDoctorCommand — API ping 失敗 (401 認証エラー)", () => {
  it("getMe が AuthError を throw した場合は warn になること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("仕事用", { kind: "sid", value: "s%3Ainvalid-sid" })

    const getPlain = capturePlainOutput()
    await runDoctor(defaultArgs, credStore, () => unauthorizedClient())
    const output = getPlain()

    // 認証エラーは exit 1
    expect(exitMock).toHaveBeenCalledWith(1)
    expect(output).toContain("✗ 仕事用")
    expect(output).toContain("セッションが無効")
  })

  it("エラーメッセージに再ログインコマンドが含まれること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("仕事用", { kind: "sid", value: "s%3Ainvalid-sid" })

    const getPlain = capturePlainOutput()
    await runDoctor(defaultArgs, credStore, () => unauthorizedClient())
    const output = getPlain()

    expect(output).toContain("cos auth login --profile 仕事用")
  })
})

describe("authDoctorCommand — API ping 失敗 (200 + ゲストレスポンス = ZodError)", () => {
  it("getMe が ZodError を throw した場合はセッション無効として warn になること", async () => {
    // Cosense は無効なセッションで 401 でなく 200 + ゲストレスポンスを返すことがある
    // その場合 MeSchema のパースが失敗して ZodError が throw される
    const credStore = new InMemoryCredentialStore()
    await credStore.save("期限切れ", { kind: "sid", value: "s%3Aexpired-sid" })

    const zodError = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        path: ["id"],
        message: "Required",
        expected: "string",
        received: "undefined",
      },
    ])
    const zodErrorClient = () => ({
      getMe: async (): Promise<never> => {
        throw zodError
      },
    })

    const getPlain = capturePlainOutput()
    await runDoctor(defaultArgs, credStore, zodErrorClient)
    const output = getPlain()

    expect(exitMock).toHaveBeenCalledWith(1)
    expect(output).toContain("✗ 期限切れ")
    expect(output).toContain("セッションが無効")
    expect(output).toContain("cos auth login --profile 期限切れ")
  })
})

describe("authDoctorCommand — API ping ネットワークエラー", () => {
  it("getMe がネットワークエラーを throw した場合は warn になること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid" })

    const getPlain = capturePlainOutput()
    await runDoctor(defaultArgs, credStore, () => networkErrorClient())
    const output = getPlain()

    expect(exitMock).toHaveBeenCalledWith(1)
    expect(output).toContain("✗ default")
    expect(output).toContain("API 疎通確認に失敗しました")
  })
})

describe("authDoctorCommand — --offline フラグ", () => {
  it("--offline を指定した場合は API ping をスキップして ok になること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid" })

    // getMe が呼ばれたら失敗するクライアントを渡しても ok になるはず
    const getPlain = capturePlainOutput()
    await runDoctor({ ...defaultArgs, offline: true }, credStore, () => networkErrorClient())
    const output = getPlain()

    expect(exitMock).not.toHaveBeenCalled()
    expect(output).toContain("✓ default")
  })
})

describe("authDoctorCommand — createClient に Credential が渡されること", () => {
  it("createClient に正しい Credential が渡されること", async () => {
    const credStore = new InMemoryCredentialStore()
    const cred: Credential = { kind: "sid", value: "s%3Atest-sid" }
    await credStore.save("default", cred)

    // TypeScript はクロージャ内の代入を追跡できないため配列で受け取る
    const capturedCredentials: Credential[] = []
    const createClient = (c: Credential) => {
      capturedCredentials.push(c)
      return successClient()
    }

    capturePlainOutput()
    await runDoctor(defaultArgs, credStore, createClient)

    expect(capturedCredentials).toHaveLength(1)
    expect(capturedCredentials[0]?.kind).toBe("sid")
    expect(capturedCredentials[0]?.value).toBe("s%3Atest-sid")
  })
})
