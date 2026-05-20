/**
 * search.test.ts — `cos search` コマンドのテスト。
 *
 * キーワード検索 (デフォルト)、ベクトル検索 (--vector)、
 * および infobox 検索 (--infobox) の動作を検証する。
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
    infobox: false,
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

    it("--limit を指定するとクライアント側で件数を切り詰める", async () => {
      await runSearch(baseArgs({ vector: true, limit: "1" }))
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      expect(output).toContain("ベクトル類似ページA")
      expect(output).not.toContain("ベクトル類似ページB")
    })
  })

  describe("infobox 検索 (--infobox)", () => {
    /** table:infobox クエリの検索結果フィクスチャ */
    const INFOBOX_SEARCH_RESULT = {
      projectName: "テストプロジェクト",
      searchQuery: "table:infobox",
      pages: [
        {
          id: "page-1",
          title: "製品仕様書",
          lines: ["table:infobox"],
          descriptions: [],
          image: null,
        },
        {
          id: "page-2",
          title: "会社情報",
          lines: ["table:infobox"],
          descriptions: [],
          image: null,
        },
      ],
    }
    /** table:cosense クエリの検索結果フィクスチャ（page-2 は dedup 対象） */
    const COSENSE_SEARCH_RESULT = {
      projectName: "テストプロジェクト",
      searchQuery: "table:cosense",
      pages: [
        {
          id: "page-2",
          title: "会社情報",
          lines: ["table:cosense"],
          descriptions: [],
          image: null,
        },
        {
          id: "page-3",
          title: "プロジェクト概要",
          lines: ["table:cosense"],
          descriptions: [],
          image: null,
        },
      ],
    }

    beforeEach(() => {
      // --infobox テスト用に searchPages をクエリで分岐させる
      searchPagesSpy.mockImplementation((_project: string, query: string) => {
        if (query === "table:infobox") return Promise.resolve(INFOBOX_SEARCH_RESULT)
        if (query === "table:cosense") return Promise.resolve(COSENSE_SEARCH_RESULT)
        return Promise.resolve({ projectName: "テストプロジェクト", searchQuery: query, pages: [] })
      })
    })

    it("dedup されて3タイトルが改行区切りで出力される", async () => {
      await runSearch(baseArgs({ infobox: true, query: undefined }))
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      expect(output).toContain("製品仕様書")
      expect(output).toContain("会社情報")
      expect(output).toContain("プロジェクト概要")
      // 会社情報 (page-2) は dedup されて1回だけ出力される
      const matches = output.match(/会社情報/g)
      expect(matches?.length).toBe(1)
    })

    it("--json で pages.length === 3 かつ meta.command === 'search' を返す", async () => {
      await runSearch(baseArgs({ infobox: true, query: undefined, json: true }))
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      const parsed = JSON.parse(output) as {
        data: { pages: Array<{ id: string; title: string }> }
        meta: { command: string }
      }
      expect(parsed.meta.command).toBe("search")
      expect(parsed.data.pages).toHaveLength(3)
    })

    it("--limit 2 でマージ後2件に切り詰められる", async () => {
      await runSearch(baseArgs({ infobox: true, query: undefined, json: true, limit: "2" }))
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      const parsed = JSON.parse(output) as {
        data: { pages: Array<{ id: string; title: string }> }
      }
      expect(parsed.data.pages).toHaveLength(2)
    })

    it("--limit に非数値を指定すると exit 5 になる", async () => {
      try {
        await runSearch(baseArgs({ infobox: true, query: undefined, limit: "abc" }))
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--limit に 0 を指定すると exit 5 になる", async () => {
      try {
        await runSearch(baseArgs({ infobox: true, query: undefined, limit: "0" }))
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--infobox と --vector を同時指定すると exit 5 になる", async () => {
      try {
        await runSearch(baseArgs({ infobox: true, vector: true, query: undefined }))
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--infobox 時に --project 未指定は exit 5 になる", async () => {
      try {
        await runSearch({ ...baseArgs({ infobox: true, query: undefined }), project: undefined })
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("query を指定すると infobox ページと AND で絞り込まれる", async () => {
      // ユーザークエリ「製品」が 製品仕様書 (page-1) だけを返す場合
      // → infobox pages (page-1, page-2, page-3) との交差 = page-1 のみ
      const querySearchResult = {
        projectName: "テストプロジェクト",
        searchQuery: "製品",
        pages: [
          {
            id: "page-1",
            title: "製品仕様書",
            lines: ["table:infobox"],
            descriptions: [],
            image: null,
          },
        ],
      }
      searchPagesSpy.mockImplementation((_project: string, query: string) => {
        if (query === "table:infobox") return Promise.resolve(INFOBOX_SEARCH_RESULT)
        if (query === "table:cosense") return Promise.resolve(COSENSE_SEARCH_RESULT)
        // ユーザー指定クエリ
        return Promise.resolve(querySearchResult)
      })

      await runSearch(baseArgs({ infobox: true, query: "製品" }))
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      // infobox かつ query にも含まれる page-1 のみ出力される
      expect(output).toContain("製品仕様書")
      // infobox ページだが query に含まれない page-2, page-3 は除外される
      expect(output).not.toContain("会社情報")
      expect(output).not.toContain("プロジェクト概要")
    })
  })

  describe("query バリデーション", () => {
    it("--infobox なしで query 省略すると exit 5 になる", async () => {
      try {
        await runSearch({ ...baseArgs(), query: undefined })
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })
})
