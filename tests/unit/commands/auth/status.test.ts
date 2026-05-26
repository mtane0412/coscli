/**
 * status.test.ts — `cos auth status` コマンドのユニットテスト。
 *
 * アクティブな認証情報と解決経路を表示する動作を検証する。
 * keychain は InMemoryCredentialStore で代替し、環境変数は各テストで制御する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { createAuthStatusCommand } from "@/commands/auth/status"
import { InMemoryCredentialStore } from "@/core/auth/credential-store"

// ---------------------------------------------------------------------------
// テスト前後処理
// ---------------------------------------------------------------------------

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
  Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
  Reflect.deleteProperty(process.env, "COS_PROFILE")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock?.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
  Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
  Reflect.deleteProperty(process.env, "COS_PROFILE")
})

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function captureJsonOutput(): () => unknown {
  const chunks: string[] = []
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => JSON.parse(chunks.join(""))
}

function capturePlainOutput(): () => string {
  const chunks: string[] = []
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => chunks.join("")
}

async function runStatus(args: Record<string, unknown>, credStore: InMemoryCredentialStore) {
  const command = createAuthStatusCommand({ createCredStore: () => credStore })
  await (command.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

const jsonArgs = {
  json: true,
  plain: false,
  quiet: false,
  verbose: false,
  profile: undefined,
  "results-only": false,
}

const plainArgs = {
  json: false,
  plain: false,
  quiet: false,
  verbose: false,
  profile: undefined,
  "results-only": false,
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("authStatusCommand — 環境変数 COS_PERSONAL_ACCESS_TOKEN", () => {
  it("JSON 出力に kind: 'pat' と source: 'env:COS_PERSONAL_ACCESS_TOKEN' が含まれること", async () => {
    process.env["COS_PERSONAL_ACCESS_TOKEN"] = `pat_${"a".repeat(64)}`
    const credStore = new InMemoryCredentialStore()

    const getJson = captureJsonOutput()
    await runStatus(jsonArgs, credStore)
    const output = getJson() as { data?: Record<string, unknown> }

    expect(output.data?.["kind"]).toBe("pat")
    expect(output.data?.["source"]).toBe("env:COS_PERSONAL_ACCESS_TOKEN")
  })
})

describe("authStatusCommand — COS_SID 環境変数", () => {
  it("JSON 出力に kind: 'sid' と source: 'env:COS_SID' が含まれること", async () => {
    process.env["COS_SID"] = "s%3Atest-sid-xyz"
    const credStore = new InMemoryCredentialStore()

    const getJson = captureJsonOutput()
    await runStatus(jsonArgs, credStore)
    const output = getJson() as { data?: Record<string, unknown> }

    expect(output.data?.["kind"]).toBe("sid")
    expect(output.data?.["source"]).toBe("env:COS_SID")
  })
})

describe("authStatusCommand — keychain プロファイル", () => {
  it("keychain の default プロファイルから解決した場合に source: 'profile:default' が含まれること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Akeychain-sid" })

    const getJson = captureJsonOutput()
    await runStatus(jsonArgs, credStore)
    const output = getJson() as { data?: Record<string, unknown> }

    expect(output.data?.["kind"]).toBe("sid")
    expect(output.data?.["source"]).toBe("profile:default")
  })

  it("--profile work を指定した場合に source: 'profile:work' が含まれること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("work", { kind: "pat", value: `pat_${"b".repeat(64)}` })

    const getJson = captureJsonOutput()
    await runStatus({ ...jsonArgs, profile: "work" }, credStore)
    const output = getJson() as { data?: Record<string, unknown> }

    expect(output.data?.["kind"]).toBe("pat")
    expect(output.data?.["source"]).toBe("profile:work")
  })
})

describe("authStatusCommand — プレーン出力", () => {
  it("プレーン出力に kind と source が含まれること", async () => {
    process.env["COS_SID"] = "s%3Atest-plain-sid"
    const credStore = new InMemoryCredentialStore()

    const getPlain = capturePlainOutput()
    await runStatus(plainArgs, credStore)
    const output = getPlain()

    expect(output).toContain("sid")
    expect(output).toContain("COS_SID")
  })
})

describe("authStatusCommand — 認証情報なし", () => {
  it("認証情報が解決できない場合は exit 2 になること", async () => {
    const credStore = new InMemoryCredentialStore()
    // 環境変数なし・keychain 空

    try {
      await runStatus(jsonArgs, credStore)
    } catch {
      // exitWithError による throw は想定内
    }

    expect(exitMock).toHaveBeenCalledWith(2)
  })
})
