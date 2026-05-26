/**
 * doctor.test.ts — `cos auth doctor` コマンドのユニットテスト。
 *
 * 全プロファイルのフォーマット検証を行う動作を検証する。
 * (API ping は --check オプションのオプトインであり、ここではフォーマット検証のみテストする)
 * keychain は InMemoryCredentialStore で代替する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { createAuthDoctorCommand } from "@/commands/auth/doctor"
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

async function runDoctor(args: Record<string, unknown>, credStore: InMemoryCredentialStore) {
  const command = createAuthDoctorCommand({ createCredStore: () => credStore })
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
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("authDoctorCommand — 全プロファイル正常", () => {
  it("全プロファイルが OK の場合は exit しないこと", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid" })
    await credStore.save("work", { kind: "pat", value: `pat_${"a".repeat(64)}` })

    const getPlain = capturePlainOutput()
    await runDoctor(defaultArgs, credStore)
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
    await runDoctor(defaultArgs, credStore)
    const output = getPlain()

    expect(exitMock).not.toHaveBeenCalled()
    expect(output.length).toBeGreaterThanOrEqual(0)
  })
})

describe("authDoctorCommand — --json 出力", () => {
  it("JSON 出力に profiles 配列が含まれること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid" })

    const getJson = captureJsonOutput()
    await runDoctor({ ...defaultArgs, json: true }, credStore)
    const output = getJson() as { data?: { profiles: unknown[] } }

    expect(output.data?.profiles).toHaveLength(1)
  })
})
