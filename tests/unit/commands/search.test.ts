/**
 * search.test.ts — `cos search` コマンドのテスト。
 *
 * プロジェクト内のページをキーワード検索する動作を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { searchCommand } from "@/commands/search"
import { CosenseRestClient } from "@/core/api/rest"

/** SearchResult の最小限フィクスチャ */
const SEARCH_PAGES_FIXTURE = {
  projectName: "テストプロジェクト",
  searchQuery: "hello",
  pages: [
    { id: "page-id-1", title: "Hello World" },
    { id: "page-id-2", title: "Helloと挨拶" },
  ],
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let searchPagesSpy: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runSearch(args: Record<string, unknown>) {
  await (
    searchCommand.run as (ctx: {
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
    project: "テストプロジェクト",
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
  searchPagesSpy = spyOn(CosenseRestClient.prototype, "searchPages").mockResolvedValue(
    SEARCH_PAGES_FIXTURE as never,
  )
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  searchPagesSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("searchCommand", () => {
  it("searchPages が呼ばれ title 一覧を改行区切りで出力する", async () => {
    await runSearch(baseArgs())
    expect(searchPagesSpy).toHaveBeenCalledTimes(1)
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toContain("Hello World")
    expect(output).toContain("Helloと挨拶")
  })

  it("--project 未指定かつ COS_PROJECT 未設定は PROJECT_REQUIRED で exit 5 になる", async () => {
    try {
      await runSearch({ ...baseArgs(), project: undefined })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("PROJECT_REQUIRED"))
  })
})
