/**
 * rest.stream.test.ts — CosenseRestClient.getProjectStream のテスト。
 *
 * msw でモックサーバーを立て、/api/stream/:project/ の挙動を検証する。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test"
import {
  AuthError,
  CosenseRestClient,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from "@/core/api/rest"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import streamFixture from "../../../fixtures/project-stream.json"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_SID = "s%3Atest-connect-sid"

/** 最後にキャプチャしたリクエスト URL */
let capturedUrl = ""

const server = setupServer(
  http.get(`${BASE_URL}/api/stream/:project/`, ({ request, params }) => {
    capturedUrl = request.url

    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const project = decodeURIComponent(params["project"] as string)
    if (project === TEST_PROJECT) {
      return HttpResponse.json(streamFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),
)

beforeAll(() => server.listen())
afterAll(() => server.close())
afterEach(() => {
  server.resetHandlers()
  capturedUrl = ""
})

/** 認証済みクライアントを生成するヘルパー */
function makeClient(opts?: { timeout?: number }): CosenseRestClient {
  return new CosenseRestClient({ sid: TEST_SID, ...opts })
}

describe("CosenseRestClient.getProjectStream", () => {
  describe("正常系", () => {
    it("StreamResponse をパースして返す", async () => {
      const client = makeClient()
      const result = await client.getProjectStream(TEST_PROJECT)

      expect(result.projectName).toBe("テストプロジェクト")
      expect(result.end).toBe(1700000000)
      expect(result.pages).toHaveLength(2)
      expect(result.events).toHaveLength(7)
    })

    it("URL が末尾スラッシュ付きの /api/stream/:project/ 形式になっている", async () => {
      const client = makeClient()
      await client.getProjectStream(TEST_PROJECT)

      // /api/stream/テストプロジェクト/ のように末尾スラッシュが付いていることを確認
      expect(capturedUrl).toContain(`/api/stream/${encodeURIComponent(TEST_PROJECT)}/`)
    })

    it("日本語プロジェクト名が URL エンコードされる", async () => {
      const client = makeClient()
      await client.getProjectStream(TEST_PROJECT)

      // 日本語がパーセントエンコードされていることを確認
      expect(capturedUrl).toContain(encodeURIComponent(TEST_PROJECT))
    })

    it("--limit を指定すると URL クエリに limit パラメータが付く", async () => {
      const client = makeClient()
      // limit パラメータを受け付けるモックに差し替え
      server.use(
        http.get(`${BASE_URL}/api/stream/:project/`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json(streamFixture)
        }),
      )
      await client.getProjectStream(TEST_PROJECT, { limit: 10 })

      const url = new URL(capturedUrl)
      expect(url.searchParams.get("limit")).toBe("10")
    })
  })

  describe("エラー系", () => {
    it("401 は AuthError になる", async () => {
      server.use(
        http.get(`${BASE_URL}/api/stream/:project/`, () => {
          return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
        }),
      )
      const client = makeClient()
      await expect(client.getProjectStream(TEST_PROJECT)).rejects.toBeInstanceOf(AuthError)
    })

    it("403 は ForbiddenError になる", async () => {
      server.use(
        http.get(`${BASE_URL}/api/stream/:project/`, () => {
          return HttpResponse.json({ message: "Forbidden" }, { status: 403 })
        }),
      )
      const client = makeClient()
      await expect(client.getProjectStream(TEST_PROJECT)).rejects.toBeInstanceOf(ForbiddenError)
    })

    it("404 は NotFoundError になる", async () => {
      const client = makeClient()
      // 存在しないプロジェクト (サーバーが 404 を返す)
      await expect(client.getProjectStream("存在しないプロジェクト名")).rejects.toBeInstanceOf(
        NotFoundError,
      )
    })

    it("429 は RateLimitError になる", async () => {
      server.use(
        http.get(`${BASE_URL}/api/stream/:project/`, () => {
          return HttpResponse.json({ message: "Too Many Requests" }, { status: 429 })
        }),
      )
      const client = makeClient()
      await expect(client.getProjectStream(TEST_PROJECT)).rejects.toBeInstanceOf(RateLimitError)
    })

    it("タイムアウトで AbortError が発生する", async () => {
      // 応答を遅延させてタイムアウトを誘発
      server.use(
        http.get(`${BASE_URL}/api/stream/:project/`, async () => {
          await new Promise((r) => setTimeout(r, 200))
          return HttpResponse.json(streamFixture)
        }),
      )
      const client = makeClient({ timeout: 50 })
      await expect(client.getProjectStream(TEST_PROJECT)).rejects.toThrow()
    })
  })
})
