/**
 * list.test.ts — `cos auth list` コマンドのユニットテスト。
 *
 * keychain に登録された全プロファイルを kind 付きで一覧表示する動作を検証する。
 * keychain は InMemoryCredentialStore で代替する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { createAuthListCommand } from "@/commands/auth/list"
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
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock?.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
  Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
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

async function runList(args: Record<string, unknown>, credStore: InMemoryCredentialStore) {
  const command = createAuthListCommand({ createCredStore: () => credStore })
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

describe("authListCommand — --json 出力", () => {
  it("登録済みプロファイルが kind・defaultProject 付きで返ること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid-abc" })
    await credStore.save("work-pat", { kind: "pat", value: `pat_${"a".repeat(64)}` })
    await credStore.save("cs_仕事プロジェクト", {
      kind: "sa",
      value: "cs_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      defaultProject: "仕事プロジェクト",
    })

    const getJson = captureJsonOutput()
    await runList({ ...defaultArgs, json: true }, credStore)
    const output = getJson() as { data?: { profiles: Array<Record<string, unknown>> } }

    expect(output.data?.profiles).toHaveLength(3)
    const sidEntry = output.data?.profiles.find((p) => p["profile"] === "default")
    expect(sidEntry?.["kind"]).toBe("sid")
    const patEntry = output.data?.profiles.find((p) => p["profile"] === "work-pat")
    expect(patEntry?.["kind"]).toBe("pat")
    const saEntry = output.data?.profiles.find((p) => p["profile"] === "cs_仕事プロジェクト")
    expect(saEntry?.["kind"]).toBe("sa")
    expect(saEntry?.["defaultProject"]).toBe("仕事プロジェクト")
  })

  it("プロファイルが空の場合は空配列を返すこと", async () => {
    const credStore = new InMemoryCredentialStore()
    const getJson = captureJsonOutput()
    await runList({ ...defaultArgs, json: true }, credStore)
    const output = getJson() as { data?: { profiles: unknown[] } }
    expect(output.data?.profiles).toHaveLength(0)
  })
})

describe("authListCommand — プレーン出力", () => {
  it("プロファイル名と kind が表示されること", async () => {
    const credStore = new InMemoryCredentialStore()
    await credStore.save("default", { kind: "sid", value: "s%3Atest-sid-abc" })
    await credStore.save("work-pat", { kind: "pat", value: `pat_${"a".repeat(64)}` })

    const getPlain = capturePlainOutput()
    await runList(defaultArgs, credStore)
    const output = getPlain()

    expect(output).toContain("default")
    expect(output).toContain("sid")
    expect(output).toContain("work-pat")
    expect(output).toContain("pat")
  })
})
