/**
 * project/search.test.ts — `cos project search` コマンドのテスト。
 *
 * 参加プロジェクト横断検索でマッチしたプロジェクト一覧を返す動作を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { projectSearchCommand } from "@/commands/project/search"
import { CosenseRestClient } from "@/core/api/rest"

/** ProjectSearchResult の最小限フィクスチャ */
const SEARCH_JOINED_FIXTURE = {
  searchQuery: "hello",
  query: { words: ["hello"], excludes: [] },
  projects: [
    { _id: "proj-id-my", name: "myproject", displayName: "マイプロジェクト" },
    { _id: "proj-id-help", name: "helpproject", displayName: "ヘルプ" },
  ],
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let searchJoinedProjectsSpy: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runProjectSearch(args: Record<string, unknown>) {
  await (
    projectSearchCommand.run as (ctx: {
      args: unknown
      cmd: never
      rawArgs: string[]
    }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

/** 共通の args ベース */
function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    query: "hello",
    json: false,
    plain: false,
    "results-only": false,
    quiet: true,
    ...overrides,
  }
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  // buildRestClient がキーチェーン呼び出しをスキップできるようダミー SID を設定する
  process.env["COS_SID"] = "s%3Atest-session-id"
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  searchJoinedProjectsSpy = spyOn(
    CosenseRestClient.prototype,
    "searchJoinedProjects",
  ).mockResolvedValue(SEARCH_JOINED_FIXTURE as never)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  searchJoinedProjectsSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("projectSearchCommand", () => {
  it("searchJoinedProjects が呼ばれ name と displayName をタブ区切りで出力する", async () => {
    await runProjectSearch(baseArgs())
    expect(searchJoinedProjectsSpy).toHaveBeenCalledTimes(1)
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toContain("myproject")
    expect(output).toContain("マイプロジェクト")
    expect(output).toContain("helpproject")
    expect(output).toContain("ヘルプ")
  })

  it("--json で projects 配列を含む JSON envelope を出力する", async () => {
    await runProjectSearch(baseArgs({ json: true }))
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    const parsed = JSON.parse(output)
    expect(parsed.meta.command).toBe("project.search")
    expect(parsed.data.projects).toHaveLength(2)
    expect(parsed.data.projects[0].name).toBe("myproject")
  })

  it("クエリが API に正しく渡される", async () => {
    await runProjectSearch(baseArgs({ query: "テスト検索ワード" }))
    expect(searchJoinedProjectsSpy).toHaveBeenCalledWith("テスト検索ワード")
  })
})
