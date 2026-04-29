/**
 * rest.test.ts — Cosense REST API クライアントのテスト。
 *
 * msw でモックサーバーを立て、REST クライアントの動作を検証する。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test"
import { CosenseRestClient } from "@/core/api/rest"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import meFixture from "../../../fixtures/me.json"
import pageDetailFixture from "../../../fixtures/page-detail.json"
import pageListFixture from "../../../fixtures/page-list.json"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_SID = "s%3Atest-connect-sid"

const server = setupServer(
  http.get(`${BASE_URL}/api/users/me`, ({ request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    return HttpResponse.json(meFixture)
  }),

  http.get(`${BASE_URL}/api/pages/:project`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (params["project"] === TEST_PROJECT) {
      return HttpResponse.json(pageListFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (
      params["project"] === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === "Hello_World"
    ) {
      return HttpResponse.json(pageDetailFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  http.get(`${BASE_URL}/api/pages/:project/:title/text`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return new HttpResponse("Unauthorized", { status: 401 })
    }
    if (
      params["project"] === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === "Hello_World"
    ) {
      return new HttpResponse("Hello World\n最初の行\n2行目")
    }
    return new HttpResponse("Not found", { status: 404 })
  }),

  http.get(`${BASE_URL}/api/pages/:project/search/query`, ({ request, params }) => {
    if (params["project"] === TEST_PROJECT) {
      const url = new URL(request.url)
      const query = url.searchParams.get("q")
      return HttpResponse.json({
        projectName: TEST_PROJECT,
        pages:
          query === "Hello"
            ? [{ id: "page-id-hello", title: "Hello World", words: ["Hello"] }]
            : [],
      })
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("CosenseRestClient", () => {
  describe("getMe", () => {
    it("認証済みの場合はユーザー情報を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const me = await client.getMe()
      expect(me.name).toBe("テストユーザー")
      expect(me.csrfToken).toBe("test-csrf-token-12345")
    })

    it("未認証の場合は AuthError をスローする", async () => {
      const client = new CosenseRestClient({ sid: "" })
      await expect(client.getMe()).rejects.toThrow()
    })
  })

  describe("listPages", () => {
    it("ページ一覧を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.listPages(TEST_PROJECT)
      expect(result.pages).toHaveLength(2)
      expect(result.pages[0]?.title).toBe("Hello World")
      expect(result.pages[1]?.title).toBe("日本語タイトル")
    })

    it("ページ数を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.listPages(TEST_PROJECT)
      expect(result.count).toBe(2)
    })

    it("存在しないプロジェクトは NotFoundError をスローする", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      await expect(client.listPages("存在しないプロジェクト")).rejects.toThrow()
    })
  })

  describe("getPage", () => {
    it("ページ詳細を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const page = await client.getPage(TEST_PROJECT, "Hello World")
      expect(page.title).toBe("Hello World")
      expect(page.lines).toHaveLength(3)
      expect(page.lines[0]?.text).toBe("Hello World")
    })

    it("存在しないページは NotFoundError をスローする", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      await expect(client.getPage(TEST_PROJECT, "存在しないページ")).rejects.toThrow()
    })
  })

  describe("getPageText", () => {
    it("ページのプレーンテキストを返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const text = await client.getPageText(TEST_PROJECT, "Hello World")
      expect(text).toContain("Hello World")
      expect(text).toContain("最初の行")
    })
  })

  describe("searchPages", () => {
    it("クエリにマッチするページを返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.searchPages(TEST_PROJECT, "Hello")
      expect(result.pages).toHaveLength(1)
      expect(result.pages[0]?.title).toBe("Hello World")
    })

    it("マッチしないクエリは空配列を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.searchPages(TEST_PROJECT, "存在しないキーワード")
      expect(result.pages).toHaveLength(0)
    })
  })
})
