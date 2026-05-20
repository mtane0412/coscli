/**
 * page/find-infobox.test.ts — `cos page find-infobox` コマンドのテスト。
 *
 * table:infobox / table:cosense の2クエリ検索・マージ・dedup・件数制限、
 * エラー系・sandbox 違反を検証する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageFindInfoboxCommand } from "@/commands/page/find-infobox"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"

/** table:infobox 検索結果フィクスチャ（lines に実際のテーブル定義行を含む） */
const SEARCH_RESULT_INFOBOX = {
  projectName: TEST_PROJECT,
  searchQuery: "table:infobox",
  pages: [
    { id: "page-1", title: "製品仕様書", descriptions: [], image: null, lines: ["table:infobox"] },
    { id: "page-2", title: "会社情報", descriptions: [], image: null, lines: ["table:infobox"] },
  ],
}

/** table:cosense 検索結果フィクスチャ（page-2 は重複） */
const SEARCH_RESULT_COSENSE = {
  projectName: TEST_PROJECT,
  searchQuery: "table:cosense",
  pages: [
    { id: "page-2", title: "会社情報", descriptions: [], image: null, lines: ["table:cosense"] },
    {
      id: "page-3",
      title: "プロジェクト概要",
      descriptions: [],
      image: null,
      lines: ["table:cosense"],
    },
  ],
}

/** 両クエリが空結果 */
const SEARCH_RESULT_EMPTY = {
  projectName: TEST_PROJECT,
  searchQuery: "",
  pages: [],
}

const server = setupServer(
  // /api/pages/:project/search/query モック（クエリパラメータで分岐）
  http.get(`${BASE_URL}/api/pages/:project/search/query`, ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get("q")
    if (query === "table:infobox") return HttpResponse.json(SEARCH_RESULT_INFOBOX)
    if (query === "table:cosense") return HttpResponse.json(SEARCH_RESULT_COSENSE)
    return HttpResponse.json(SEARCH_RESULT_EMPTY)
  }),
  // 認証確認用
  http.get(`${BASE_URL}/api/users/me`, () => {
    return HttpResponse.json({ id: "テストユーザーID", name: "テストユーザー" })
  }),
)

beforeAll(() => server.listen())
afterAll(() => server.close())

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

async function runFindInfobox(args: Record<string, unknown>) {
  await (
    pageFindInfoboxCommand.run as (ctx: {
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

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  server.resetHandlers()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageFindInfoboxCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runFindInfobox({
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("正常系 (plain): dedup されて3タイトルが出力される", async () => {
    try {
      await runFindInfobox({
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(output).toContain("製品仕様書")
    expect(output).toContain("会社情報")
    expect(output).toContain("プロジェクト概要")
    // 会社情報 (page-2) は1回だけ出力される
    const matches = output.match(/会社情報/g)
    expect(matches?.length).toBe(1)
  })

  it("--json 指定時: pages.length === 3 かつ meta.command === 'page.find-infobox'", async () => {
    try {
      await runFindInfobox({
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as {
      data: { pages: Array<{ id: string; title: string }> }
      meta: { command: string }
    }
    expect(parsed.meta.command).toBe("page.find-infobox")
    expect(parsed.data.pages).toHaveLength(3)
  })

  it("--limit 2 指定時: マージ後に2件に切り詰められる", async () => {
    try {
      await runFindInfobox({
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
        limit: "2",
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as {
      data: { pages: Array<{ id: string; title: string }> }
    }
    expect(parsed.data.pages).toHaveLength(2)
  })

  it("--disable-commands page.find-infobox 指定時は exit 7 で終了する", async () => {
    try {
      await runFindInfobox({
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
        "disable-commands": "page.find-infobox",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("両クエリが空結果の場合は空リストが返る (--json)", async () => {
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/search/query`, () =>
        HttpResponse.json(SEARCH_RESULT_EMPTY),
      ),
    )
    try {
      await runFindInfobox({
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as {
      data: { pages: unknown[] }
    }
    expect(parsed.data.pages).toHaveLength(0)
  })

  it("タイトルが 'table:infobox' のページは除外される", async () => {
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/search/query`, ({ request }) => {
        const url = new URL(request.url)
        const query = url.searchParams.get("q")
        if (query === "table:infobox")
          return HttpResponse.json({
            projectName: TEST_PROJECT,
            searchQuery: "table:infobox",
            pages: [
              // タイトルが "table:infobox" のページ（記法説明ページ）→ 除外対象
              {
                id: "page-title",
                title: "table:infobox",
                lines: ["table:infobox"],
                descriptions: [],
                image: null,
              },
              // 実際にテーブル定義を持つページ → 含まれるべき
              {
                id: "page-real",
                title: "製品仕様書",
                lines: ["table:infobox"],
                descriptions: [],
                image: null,
              },
            ],
          })
        return HttpResponse.json(SEARCH_RESULT_EMPTY)
      }),
    )
    try {
      await runFindInfobox({
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as {
      data: { pages: Array<{ id: string; title: string }> }
    }
    expect(parsed.data.pages).toHaveLength(1)
    expect(parsed.data.pages[0]?.title).toBe("製品仕様書")
  })

  it("インラインコード記法 (`table:infobox`) で言及するだけのページは除外される", async () => {
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/search/query`, ({ request }) => {
        const url = new URL(request.url)
        const query = url.searchParams.get("q")
        if (query === "table:infobox")
          return HttpResponse.json({
            projectName: TEST_PROJECT,
            searchQuery: "table:infobox",
            pages: [
              // インラインコードで言及するだけのページ → 除外対象
              {
                id: "page-inline",
                title: "記法説明",
                lines: ["`table:infobox` を使います"],
                descriptions: [],
                image: null,
              },
              // 実際にテーブル定義を持つページ → 含まれるべき
              {
                id: "page-real",
                title: "製品仕様書",
                lines: ["table:infobox"],
                descriptions: [],
                image: null,
              },
            ],
          })
        return HttpResponse.json(SEARCH_RESULT_EMPTY)
      }),
    )
    try {
      await runFindInfobox({
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as {
      data: { pages: Array<{ id: string; title: string }> }
    }
    expect(parsed.data.pages).toHaveLength(1)
    expect(parsed.data.pages[0]?.title).toBe("製品仕様書")
  })

  it("401 エラー時は exit 2 で終了する", async () => {
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/search/query`, () =>
        HttpResponse.json({ message: "Unauthorized" }, { status: 401 }),
      ),
    )
    try {
      await runFindInfobox({
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(2)
  })
})
