/**
 * search.test.ts — `cos search` コマンドのテスト。
 *
 * キーワード検索 (デフォルト) およびベクトル検索 (--vector) の動作を検証する。
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

/** VectorSearchResult の最小限フィクスチャ */
const VECTOR_SEARCH_FIXTURE = {
  pages: [
    { id: "page-id-1", title: "ベクトル類似ページA", score: 0.95, exists: true },
    { title: "ベクトル類似ページB", score: 0.87, exists: false },
  ],
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let searchPagesSpy: ReturnType<typeof spyOn>
let searchVectorTitlesSpy: ReturnType<typeof spyOn>

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
    vector: false,
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
  searchVectorTitlesSpy = spyOn(
    CosenseRestClient.prototype,
    "searchVectorTitles",
  ).mockResolvedValue(VECTOR_SEARCH_FIXTURE as never)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  searchPagesSpy.mockRestore()
  searchVectorTitlesSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("searchCommand", () => {
  describe("キーワード検索 (デフォルト)", () => {
    it("searchPages が呼ばれ title 一覧を改行区切りで出力する", async () => {
      await runSearch(baseArgs())
      expect(searchPagesSpy).toHaveBeenCalledTimes(1)
      expect(searchVectorTitlesSpy).not.toHaveBeenCalled()
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

  describe("ベクトル検索 (--vector)", () => {
    it("--vector 指定時は searchVectorTitles が呼ばれ title 一覧を出力する", async () => {
      await runSearch(baseArgs({ vector: true }))
      expect(searchVectorTitlesSpy).toHaveBeenCalledTimes(1)
      expect(searchPagesSpy).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      expect(output).toContain("ベクトル類似ページA")
      expect(output).toContain("ベクトル類似ページB")
    })

    it("--vector --json で pages 配列と score を含む JSON envelope を出力する", async () => {
      await runSearch(baseArgs({ vector: true, json: true }))
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      const parsed = JSON.parse(output)
      expect(parsed.meta.command).toBe("search")
      expect(parsed.data.pages).toHaveLength(2)
      expect(parsed.data.pages[0].score).toBe(0.95)
    })

    it("クエリとプロジェクトが API に正しく渡される", async () => {
      await runSearch(baseArgs({ vector: true, query: "意味的類似ページ" }))
      expect(searchVectorTitlesSpy).toHaveBeenCalledWith("テストプロジェクト", "意味的類似ページ")
    })

    it("--vector と --limit の同時指定は LIMIT_NOT_SUPPORTED_WITH_VECTOR で exit 5 になる", async () => {
      try {
        await runSearch(baseArgs({ vector: true, limit: "10" }))
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT_NOT_SUPPORTED_WITH_VECTOR"),
      )
    })
  })
})
