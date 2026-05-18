/**
 * createFetchHandler のテスト。
 *
 * Bun.serve への接続なしに fetch ハンドラを純粋関数として単体テストする。
 * 上流 Cosense REST は msw でモックし、ScrapboxWriter はインメモリモックを注入する。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test"
import { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import { createPolicy } from "@/core/sandbox"
import { createFetchHandler } from "@/core/server/rest"
import type { ServerContext } from "@/core/server/types"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

// bun --coverage モードでは複数テストファイルが同一プロセスで動作するため、
// commands/page/*.test.ts の mock.module("@/core/pages", ...) が残留する場合がある。
// エイリアスキーと異なる相対パスで require() することで残留モックをバイパスし、実実装を復元する。
mock.module("@/core/pages", () => {
  return require("../../../../src/core/pages") as typeof import("@/core/pages")
})

import pageDetailFixture from "../../../fixtures/page-detail.json"
import pageListFixture from "../../../fixtures/page-list.json"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_SID = "s%3Atest-connect-sid"
const TEST_TITLE_RAW = "Hello World"
const TEST_TITLE_ENCODED = "Hello%20World"

// msw でモック ScrapboxWriter（WS 層のスタブ）
const mockWriter: ScrapboxWriter = {
  patch: async () => ({ commitId: "commit-abc", pageId: "page-id-abc" }),
  insertLines: async () => ({ commitId: "commit-insert" }),
  deletePage: async () => ({ title: TEST_TITLE_RAW }),
  pinPage: async () => ({ title: TEST_TITLE_RAW }),
  unpinPage: async () => ({ title: TEST_TITLE_RAW }),
}

const server = setupServer(
  // msw は :project をデコードして params に渡すため、TEST_PROJECT（日本語）とそのまま比較する
  http.get(`${BASE_URL}/api/pages/:project`, ({ params }) => {
    if (params["project"] === TEST_PROJECT) {
      return HttpResponse.json(pageListFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
    // encodePageTitle はスペースを _ に変換するため _ をスペースに戻して比較
    const decodedTitle = decodeURIComponent(params["title"] as string).replace(/_/g, " ")
    if (params["project"] === TEST_PROJECT && decodedTitle === TEST_TITLE_RAW) {
      return HttpResponse.json(pageDetailFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  http.get(`${BASE_URL}/api/pages/:project/:title/text`, ({ params }) => {
    const decodedTitle = decodeURIComponent(params["title"] as string).replace(/_/g, " ")
    if (params["project"] === TEST_PROJECT && decodedTitle === TEST_TITLE_RAW) {
      return new HttpResponse("Hello World\n最初の行\n2行目", {
        headers: { "Content-Type": "text/plain" },
      })
    }
    return new HttpResponse("Not found", { status: 404 })
  }),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** テスト用のデフォルト ServerContext を生成する。 */
function makeContext(overrides?: Partial<ServerContext>): ServerContext {
  return {
    restClient: new CosenseRestClient({ sid: TEST_SID }),
    writer: mockWriter,
    project: TEST_PROJECT,
    policy: createPolicy({}),
    allowWrite: false,
    ...overrides,
  }
}

describe("createFetchHandler", () => {
  describe("GET /healthz", () => {
    it("200 と ok:true を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(new Request("http://localhost/healthz"))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ ok: true })
    })
  })

  describe("GET /api/pages — listPages", () => {
    it("200 と pages 一覧を envelope で返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(new Request("http://localhost/api/pages"))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; data: typeof pageListFixture }
      expect(body.ok).toBe(true)
      expect(body.data.projectName).toBe(TEST_PROJECT)
      expect(body.data.pages).toHaveLength(2)
    })

    it("skip=10abc（先頭が数値の不正値）は 400 VALIDATION_ERROR を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(new Request("http://localhost/api/pages?skip=10abc"))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("VALIDATION_ERROR")
    })

    it("limit=1.5（小数）は 400 VALIDATION_ERROR を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(new Request("http://localhost/api/pages?limit=1.5"))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("VALIDATION_ERROR")
    })

    it("skip=abc（非数値）は 400 VALIDATION_ERROR を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(new Request("http://localhost/api/pages?skip=abc"))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("VALIDATION_ERROR")
    })
  })

  describe("GET /api/pages/:title — getPage", () => {
    it("既存ページは 200 と詳細データを envelope で返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}`))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; data: typeof pageDetailFixture }
      expect(body.ok).toBe(true)
      expect(body.data.title).toBe(TEST_TITLE_RAW)
    })

    it("存在しないページは 404 NOT_FOUND を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(
        new Request("http://localhost/api/pages/%E5%AD%98%E5%9C%A8%E3%81%97%E3%81%AA%E3%81%84"),
      )
      expect(res.status).toBe(404)
      const body = (await res.json()) as { ok: boolean; error: { code: string } }
      expect(body.ok).toBe(false)
      expect(body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("GET /api/pages/:title/text — getPageText", () => {
    it("既存ページのテキストを text/plain で返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(
        new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}/text`),
      )
      expect(res.status).toBe(200)
      expect(res.headers.get("Content-Type")).toContain("text/plain")
      const text = await res.text()
      expect(text).toContain("Hello World")
    })
  })

  describe("未知のルート", () => {
    it("存在しないパスは 404 ROUTE_NOT_FOUND を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(new Request("http://localhost/unknown/path"))
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("ROUTE_NOT_FOUND")
    })
  })

  describe("書き込みエンドポイント — allowWrite=false（既定）", () => {
    it("POST /api/pages は 405 WRITE_DISABLED を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(
        new Request("http://localhost/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "新規ページ", lines: ["内容"] }),
        }),
      )
      expect(res.status).toBe(405)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("WRITE_DISABLED")
    })

    it("PUT /api/pages/:title は 405 WRITE_DISABLED を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(
        new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: ["更新内容"] }),
        }),
      )
      expect(res.status).toBe(405)
    })

    it("DELETE /api/pages/:title は 405 WRITE_DISABLED を返す", async () => {
      const handler = createFetchHandler(makeContext())
      const res = await handler(
        new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}`, {
          method: "DELETE",
        }),
      )
      expect(res.status).toBe(405)
    })
  })

  describe("書き込みエンドポイント — allowWrite=true", () => {
    it("POST /api/pages は writer.patch を呼び 200 を返す", async () => {
      const handler = createFetchHandler(makeContext({ allowWrite: true }))
      const res = await handler(
        new Request("http://localhost/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "新規ページ", lines: ["行1", "行2"] }),
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; data: { commitId: string } }
      expect(body.ok).toBe(true)
      expect(body.data.commitId).toBe("commit-abc")
    })

    it("PUT /api/pages/:title は writer.patch を呼び 200 を返す", async () => {
      const handler = createFetchHandler(makeContext({ allowWrite: true }))
      const res = await handler(
        new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: ["更新行"] }),
        }),
      )
      expect(res.status).toBe(200)
    })

    it("DELETE /api/pages/:title は writer.deletePage を呼び 200 を返す", async () => {
      const handler = createFetchHandler(makeContext({ allowWrite: true }))
      const res = await handler(
        new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}`, {
          method: "DELETE",
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; data: { title: string } }
      expect(body.ok).toBe(true)
      expect(body.data.title).toBe(TEST_TITLE_RAW)
    })

    it("POST body のバリデーション失敗（title なし）は 400 VALIDATION_ERROR を返す", async () => {
      const handler = createFetchHandler(makeContext({ allowWrite: true }))
      const res = await handler(
        new Request("http://localhost/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: ["行のみ"] }),
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("VALIDATION_ERROR")
    })

    it("PUT body のバリデーション失敗（lines なし）は 400 VALIDATION_ERROR を返す", async () => {
      const handler = createFetchHandler(makeContext({ allowWrite: true }))
      const res = await handler(
        new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      )
      expect(res.status).toBe(400)
    })

    it("不正な JSON body は 400 INVALID_JSON を返す", async () => {
      const handler = createFetchHandler(makeContext({ allowWrite: true }))
      const res = await handler(
        new Request("http://localhost/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "不正なJSON{{{",
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("INVALID_JSON")
    })
  })

  describe("sandbox ポリシー", () => {
    it("page.list が拒否されたら 403 POLICY_DENIED を返す", async () => {
      const handler = createFetchHandler(
        makeContext({ policy: createPolicy({ disableStr: "page.list" }) }),
      )
      const res = await handler(new Request("http://localhost/api/pages"))
      expect(res.status).toBe(403)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("POLICY_DENIED")
    })

    it("page.get が拒否されたら 403 POLICY_DENIED を返す", async () => {
      const handler = createFetchHandler(
        makeContext({ policy: createPolicy({ disableStr: "page.get" }) }),
      )
      const res = await handler(new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}`))
      expect(res.status).toBe(403)
    })

    it("page.delete が拒否されたら 403 POLICY_DENIED を返す", async () => {
      const handler = createFetchHandler(
        makeContext({ allowWrite: true, policy: createPolicy({ disableStr: "page.delete" }) }),
      )
      const res = await handler(
        new Request(`http://localhost/api/pages/${TEST_TITLE_ENCODED}`, { method: "DELETE" }),
      )
      expect(res.status).toBe(403)
    })
  })

  describe("token 認証", () => {
    // HTTP ヘッダは ASCII のみ有効なため ASCII のみのトークンを使用する
    const TEST_TOKEN = "test-secret-token-abc"
    const tokenCtx = makeContext({ token: TEST_TOKEN })

    it("token 設定時に Authorization ヘッダなしは 401 PROXY_AUTH_REQUIRED を返す", async () => {
      const handler = createFetchHandler(tokenCtx)
      const res = await handler(new Request("http://localhost/api/pages"))
      expect(res.status).toBe(401)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("PROXY_AUTH_REQUIRED")
    })

    it("token 設定時に不正な Bearer は 401 PROXY_AUTH_REQUIRED を返す", async () => {
      const handler = createFetchHandler(tokenCtx)
      const res = await handler(
        new Request("http://localhost/api/pages", {
          headers: { Authorization: "Bearer wrong-token" },
        }),
      )
      expect(res.status).toBe(401)
    })

    it("token 設定時に正しい Bearer は 200 を返す", async () => {
      const handler = createFetchHandler(tokenCtx)
      const res = await handler(
        new Request("http://localhost/api/pages", {
          headers: { Authorization: `Bearer ${TEST_TOKEN}` },
        }),
      )
      expect(res.status).toBe(200)
    })

    it("長さが異なる不正トークンは例外を投げず 401 PROXY_AUTH_REQUIRED を返す", async () => {
      // timingSafeEqual は長さ不一致で例外をスローするため、長さチェックが必須。
      // 現実的な攻撃では長さの異なるトークンが使われる可能性があるため、
      // 例外が 500 に漏れ出ていないことを検証する。
      const handler = createFetchHandler(tokenCtx)
      const shortToken = "x"
      const res = await handler(
        new Request("http://localhost/api/pages", {
          headers: { Authorization: `Bearer ${shortToken}` },
        }),
      )
      expect(res.status).toBe(401)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe("PROXY_AUTH_REQUIRED")
    })
  })
})
