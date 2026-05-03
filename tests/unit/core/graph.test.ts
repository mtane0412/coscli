/**
 * graph.test.ts — グラフ構築・シリアライズ関数のテスト。
 *
 * fetchAllLinks / buildGraph / serializeDot / graphToTsvRows の動作を検証する。
 * buildGraph と serializeDot は副作用のない純関数のため、REST クライアントは
 * fetchAllLinks のテスト時のみモックする。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test"
import { NotFoundError } from "@/core/api/rest"
import { buildGraph, fetchAllLinks, graphToTsvRows, serializeDot } from "@/core/graph"
import type { TitleSearchResult } from "@/schemas/page"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import searchTitlesPage2Fixture from "../../fixtures/search-titles-page2.json"
import searchTitlesFixture from "../../fixtures/search-titles.json"

// -------------------------------------------------------------------
// テストデータ
// -------------------------------------------------------------------

/** 相互リンク・自己参照・未作成ページ参照を含む最小テスト用ページ配列 */
const サンプルページ一覧: TitleSearchResult[] = [
  {
    id: "id-a",
    title: "ページA",
    updated: 100,
    links: ["ページB", "ページC"],
  },
  {
    id: "id-b",
    title: "ページB",
    updated: 200,
    links: ["ページA"], // 相互参照
  },
  {
    id: "id-c",
    title: "ページC",
    updated: 300,
    links: ["ページA", "ページA"], // 重複リンク
  },
]

const 自己参照ページ一覧: TitleSearchResult[] = [
  {
    id: "id-self",
    title: "自己参照ページ",
    updated: 100,
    links: ["自己参照ページ", "他ページ"],
  },
  {
    id: "id-other",
    title: "他ページ",
    updated: 200,
    links: [],
  },
]

const 未作成参照ページ一覧: TitleSearchResult[] = [
  {
    id: "id-existing",
    title: "存在するページ",
    updated: 100,
    links: ["存在しないページ"],
  },
]

// -------------------------------------------------------------------
// buildGraph テスト
// -------------------------------------------------------------------

describe("buildGraph", () => {
  describe("from 未指定 (全体グラフ)", () => {
    it("全ページを nodes として返す", () => {
      const graph = buildGraph(サンプルページ一覧, {})
      const titles = graph.nodes.map((n) => n.title)
      expect(titles).toContain("ページA")
      expect(titles).toContain("ページB")
      expect(titles).toContain("ページC")
    })

    it("全リンクを edges として返す (重複排除済み)", () => {
      const graph = buildGraph(サンプルページ一覧, {})
      // ページC → ページA は重複しているが 1 件のみ
      const AからC = graph.edges.filter((e) => e.from === "ページA" && e.to === "ページC")
      expect(AからC).toHaveLength(1)
      // ページC → ページA は重複 2 件 → 1 件に dedup
      const CからA = graph.edges.filter((e) => e.from === "ページC" && e.to === "ページA")
      expect(CからA).toHaveLength(1)
    })

    it("空ページ一覧の場合は nodes と edges が空配列", () => {
      const graph = buildGraph([], {})
      expect(graph.nodes).toHaveLength(0)
      expect(graph.edges).toHaveLength(0)
    })
  })

  describe("自己参照の除外", () => {
    it("from === to の edge を除外する", () => {
      const graph = buildGraph(自己参照ページ一覧, {})
      const selfEdges = graph.edges.filter((e) => e.from === e.to)
      expect(selfEdges).toHaveLength(0)
    })

    it("自己参照でない edge は残る", () => {
      const graph = buildGraph(自己参照ページ一覧, {})
      const normalEdge = graph.edges.find((e) => e.from === "自己参照ページ" && e.to === "他ページ")
      expect(normalEdge).toBeDefined()
    })
  })

  describe("未作成ページの扱い", () => {
    it("リンク先の未作成ページを nodes に exists: false で含める", () => {
      const graph = buildGraph(未作成参照ページ一覧, {})
      const unexisting = graph.nodes.find((n) => n.title === "存在しないページ")
      expect(unexisting).toBeDefined()
      expect(unexisting?.exists).toBe(false)
    })

    it("実在するページは exists: true (または省略)", () => {
      const graph = buildGraph(未作成参照ページ一覧, {})
      const existing = graph.nodes.find((n) => n.title === "存在するページ")
      expect(existing).toBeDefined()
      expect(existing?.exists).not.toBe(false)
    })
  })

  describe("from + depth 指定 (BFS フィルタ)", () => {
    it("depth=0 のとき起点ノードのみ・edges なし", () => {
      const graph = buildGraph(サンプルページ一覧, { from: "ページA", depth: 0 })
      expect(graph.nodes).toHaveLength(1)
      expect(graph.nodes[0]?.title).toBe("ページA")
      expect(graph.edges).toHaveLength(0)
    })

    it("depth=1 のとき起点から 1 hop のノードを含む", () => {
      const graph = buildGraph(サンプルページ一覧, { from: "ページA", depth: 1 })
      const titles = graph.nodes.map((n) => n.title)
      expect(titles).toContain("ページA")
      expect(titles).toContain("ページB")
      expect(titles).toContain("ページC")
    })

    it("depth=2 のとき 2 hop まで含む", () => {
      // ページA → ページB → ページA (循環) — ページA は既出
      const graph = buildGraph(サンプルページ一覧, { from: "ページA", depth: 2 })
      const titles = graph.nodes.map((n) => n.title)
      expect(titles).toContain("ページA")
      expect(titles).toContain("ページB")
      expect(titles).toContain("ページC")
    })

    it("起点が pages に存在しないとき NotFoundError をスローする", () => {
      expect(() => buildGraph(サンプルページ一覧, { from: "存在しないページ" })).toThrow(
        NotFoundError,
      )
    })

    it("from 指定時の edges は BFS 範囲内のリンクのみ", () => {
      const graph = buildGraph(サンプルページ一覧, { from: "ページA", depth: 1 })
      // 全 edges の from/to が BFS 到達ノード内に収まっている
      const titles = new Set(graph.nodes.map((n) => n.title))
      for (const edge of graph.edges) {
        expect(titles.has(edge.from)).toBe(true)
      }
    })
  })
})

// -------------------------------------------------------------------
// serializeDot テスト
// -------------------------------------------------------------------

describe("serializeDot", () => {
  it("有向グラフの DOT 文字列を返す", () => {
    const graph = { nodes: [], edges: [{ from: "A", to: "B" }] }
    const dot = serializeDot(graph)
    expect(dot).toMatch(/^digraph/)
    expect(dot).toContain('"A" -> "B"')
  })

  it("タイトルのダブルクォートをエスケープする", () => {
    const graph = { nodes: [], edges: [{ from: 'タイトル"引用"', to: "B" }] }
    const dot = serializeDot(graph)
    expect(dot).toContain('\\"引用\\"')
  })

  it("タイトルのバックスラッシュをエスケープする", () => {
    const graph = { nodes: [], edges: [{ from: "パス\\ファイル", to: "B" }] }
    const dot = serializeDot(graph)
    expect(dot).toContain("パス\\\\ファイル")
  })

  it("edges が空のとき空グラフを返す", () => {
    const graph = { nodes: [], edges: [] }
    const dot = serializeDot(graph)
    expect(dot).toMatch(/^digraph/)
    expect(dot).not.toContain("->")
  })
})

// -------------------------------------------------------------------
// graphToTsvRows テスト
// -------------------------------------------------------------------

describe("graphToTsvRows", () => {
  it("[from_title, to_title] の 2 次元配列を返す", () => {
    const graph = {
      nodes: [],
      edges: [
        { from: "ページA", to: "ページB" },
        { from: "ページC", to: "ページA" },
      ],
    }
    const rows = graphToTsvRows(graph)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(["ページA", "ページB"])
    expect(rows[1]).toEqual(["ページC", "ページA"])
  })

  it("edges が空のとき空配列を返す", () => {
    const graph = { nodes: [], edges: [] }
    expect(graphToTsvRows(graph)).toHaveLength(0)
  })
})

// -------------------------------------------------------------------
// fetchAllLinks テスト (MSW)
// -------------------------------------------------------------------

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_SID = "s%3Atest-connect-sid"

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
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("fetchAllLinks", () => {
  it("全ページのリンク情報を取得する (ページネーション完走)", async () => {
    const { CosenseRestClient } = await import("@/core/api/rest")
    const client = new CosenseRestClient({ sid: TEST_SID })
    const result = await fetchAllLinks(client, { project: TEST_PROJECT })
    // fixture page1: 5件 + page2: 2件 = 7件
    expect(result.pages).toHaveLength(7)
    expect(result.truncated).toBe(false)
  })

  it("limit を指定するとサンプリングして早期終了する", async () => {
    const { CosenseRestClient } = await import("@/core/api/rest")
    const client = new CosenseRestClient({ sid: TEST_SID })
    // limit=3 で 5 件の 1 ページ目から 3 件だけ取得
    const result = await fetchAllLinks(client, { project: TEST_PROJECT, limit: 3 })
    expect(result.pages.length).toBeLessThanOrEqual(3)
    expect(result.truncated).toBe(true)
  })
})
