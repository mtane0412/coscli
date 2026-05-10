/**
 * project/graph.test.ts — `cos project graph` コマンドのテスト。
 *
 * フォーマット出力 (json/dot/csv)、BFS フィルタ (--from/--depth)、
 * サンプリング (--limit)、エラー系 (未認証・未作成ページ・sandbox・バリデーション) を検証する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { projectGraphCommand } from "@/commands/project/graph"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import searchTitlesPage2Fixture from "../../../fixtures/search-titles-page2.json"
import searchTitlesFixture from "../../../fixtures/search-titles.json"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"

const server = setupServer(
  http.get(`${BASE_URL}/api/pages/:project/search/titles`, ({ request, params }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (params["project"] !== TEST_PROJECT) {
      return HttpResponse.json({ message: "Not found" }, { status: 404 })
    }
    const url = new URL(request.url)
    const followingId = url.searchParams.get("followingId")
    if (!followingId) {
      return HttpResponse.json(searchTitlesFixture, {
        headers: { "X-following-id": "page2-following-id" },
      })
    }
    if (followingId === "page2-following-id") {
      return HttpResponse.json(searchTitlesPage2Fixture)
    }
    return HttpResponse.json([])
  }),
)

beforeAll(() => server.listen())
afterAll(() => server.close())

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

/** テスト用の共通引数ヘルパー */
function makeArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project: TEST_PROJECT,
    format: "json",
    from: undefined,
    // citty のデフォルト値はコマンド実行時に適用されるため、テストでは明示的に渡す
    depth: "1",
    limit: undefined,
    json: false,
    plain: false,
    "results-only": false,
    select: undefined,
    "enable-commands": undefined,
    "disable-commands": undefined,
    verbose: undefined,
    quiet: false,
    profile: undefined,
    ...overrides,
  }
}

async function runGraph(args: Record<string, unknown>) {
  await (
    projectGraphCommand.run as (ctx: {
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

/** process.exit のモック後に継続実行で throw される例外を握り潰してコマンドを実行する */
async function runAndIgnoreExit(args: Record<string, unknown>): Promise<void> {
  try {
    await runGraph(args)
  } catch {
    // process.exit モック後の継続による throw は想定内
  }
}

/** stdout に書き出された文字列を結合して返す */
function captureStdout(): string {
  return (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  process.env["COS_SID"] = "s%3Atest-session-id"
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  server.resetHandlers()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("projectGraphCommand", () => {
  describe("プロジェクト未指定", () => {
    it("プロジェクトが指定されていない場合は exit 5 で終了する", async () => {
      await runAndIgnoreExit(makeArgs({ project: undefined }))
      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("--format バリデーション", () => {
    it("不正な --format 値の場合は VALIDATION_ERROR で exit 5", async () => {
      await runAndIgnoreExit(makeArgs({ format: "xml" }))
      expect(exitMock).toHaveBeenCalledWith(5)
      const out = captureStdout()
      expect(out).toContain("VALIDATION_ERROR")
    })

    it("--depth に負の値を指定した場合は exit 5", async () => {
      await runAndIgnoreExit(makeArgs({ depth: "-1" }))
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--limit に 0 を指定した場合は exit 5", async () => {
      await runAndIgnoreExit(makeArgs({ limit: "0" }))
      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("sandbox 拒否", () => {
    it("--disable-commands=project.graph の場合は exit 7 で終了する", async () => {
      await runAndIgnoreExit(makeArgs({ "disable-commands": "project.graph" }))
      expect(exitMock).toHaveBeenCalledWith(7)
    })
  })

  describe("--format=json (デフォルト)", () => {
    it("envelope 形式で nodes と edges を含む JSON を出力する", async () => {
      await runAndIgnoreExit(makeArgs({ format: "json" }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.data).toBeDefined()
      expect(Array.isArray(parsed.data.nodes)).toBe(true)
      expect(Array.isArray(parsed.data.edges)).toBe(true)
      // meta フィールドがある
      expect(parsed.meta).toBeDefined()
      expect(parsed.meta.command).toBe("project.graph")
    })

    it("--results-only の場合は { nodes, edges } のみ出力する", async () => {
      await runAndIgnoreExit(makeArgs({ format: "json", "results-only": true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      // data/meta が直接出ていないこと (nodes が top-level に存在する)
      expect(Array.isArray(parsed.nodes)).toBe(true)
      expect(Array.isArray(parsed.edges)).toBe(true)
    })
  })

  describe("--format=dot", () => {
    it("digraph cosense { ... } 形式の DOT テキストを出力する", async () => {
      await runAndIgnoreExit(makeArgs({ format: "dot" }))
      const out = captureStdout()
      expect(out).toContain("digraph cosense {")
      expect(out).toContain("rankdir=LR")
    })
  })

  describe("--format=csv", () => {
    it("from_title<TAB>to_title の TSV ヘッダと行を出力する", async () => {
      await runAndIgnoreExit(makeArgs({ format: "csv" }))
      const out = captureStdout()
      expect(out).toContain("from_title\tto_title")
    })
  })

  describe("--from + --depth BFS", () => {
    it("--from で起点を指定すると BFS 範囲のみのグラフを出力する", async () => {
      // "はじめに" は links: ["TypeScript入門", "プログラミング基礎"]
      await runAndIgnoreExit(
        makeArgs({ format: "json", "results-only": true, from: "はじめに", depth: "1" }),
      )
      const out = captureStdout()
      const parsed = JSON.parse(out)
      const titles = parsed.nodes.map((n: { title: string }) => n.title)
      expect(titles).toContain("はじめに")
      expect(titles).toContain("TypeScript入門")
      expect(titles).toContain("プログラミング基礎")
      // "リリースノート" は BFS 範囲外
      expect(titles).not.toContain("リリースノート")
    })

    it("--from に存在しないページを指定した場合は exit 4 で終了する", async () => {
      await runAndIgnoreExit(makeArgs({ from: "存在しないページ", depth: "1" }))
      expect(exitMock).toHaveBeenCalledWith(4)
    })
  })

  describe("--limit サンプリング", () => {
    it("--limit 件数でサンプリング打ち切りし warnings を含める", async () => {
      // limit=3 で 1 ページ目の 5 件から 3 件で打ち切る
      await runAndIgnoreExit(makeArgs({ format: "json", limit: "3" }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      // サンプリング打ち切りの警告が含まれる
      expect(parsed.meta.warnings).toBeDefined()
      const warnings: string[] = parsed.meta.warnings ?? []
      expect(warnings.some((w) => w.includes("limit"))).toBe(true)
    })
  })

  describe("認証エラー", () => {
    it("API が 401 を返した場合は exit 2 で終了する", async () => {
      // このテスト専用: 全リクエストに 401 を返す
      server.use(
        http.get(`${BASE_URL}/api/pages/:project/search/titles`, () => {
          return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
        }),
      )
      await runAndIgnoreExit(makeArgs())
      expect(exitMock).toHaveBeenCalledWith(2)
    })
  })
})
