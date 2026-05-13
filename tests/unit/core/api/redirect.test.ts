/**
 * redirect.test.ts — HTTP リダイレクト制御のテスト。
 *
 * msw でリダイレクト応答をモックし、CosenseRestClient の
 * 同一オリジン追従・外部オリジン拒否・上限回数超過を検証する。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test"
import { CosenseRestClient } from "@/core/api/rest"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import meFixture from "../../../fixtures/me.json"

const BASE_URL = "https://scrapbox.io"
const TEST_SID = "s%3Atest-connect-sid"

const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("CosenseRestClient — リダイレクト制御", () => {
  it("同一オリジンへの 302 リダイレクトを追従してレスポンスを返す", async () => {
    // 1 回目の呼び出しで 302 → 同一オリジンの /api/users/me へリダイレクト
    // 2 回目の呼び出しで正常なレスポンスを返す
    let callCount = 0
    server.use(
      http.get(`${BASE_URL}/api/users/me`, () => {
        callCount++
        if (callCount === 1) {
          return new HttpResponse(null, {
            status: 302,
            headers: { Location: `${BASE_URL}/api/users/me` },
          })
        }
        return HttpResponse.json(meFixture)
      }),
    )
    const client = new CosenseRestClient({ sid: TEST_SID })
    const me = await client.getMe()
    expect(me.name).toBe("テストユーザー")
    expect(callCount).toBe(2)
  })

  it("外部オリジンへの 302 リダイレクトはエラーをスローする (Cookie 漏洩防止)", async () => {
    // 攻撃者サーバーへのリダイレクト — connect.sid が流出しないよう拒否すること
    server.use(
      http.get(`${BASE_URL}/api/users/me`, () => {
        return new HttpResponse(null, {
          status: 302,
          headers: { Location: "https://evil.example.com/steal-cookies" },
        })
      }),
    )
    const client = new CosenseRestClient({ sid: TEST_SID })
    await expect(client.getMe()).rejects.toThrow("外部ドメイン")
  })

  it("5 回を超えるリダイレクトはエラーをスローする (ループ防止)", async () => {
    // 同一 URL への永続リダイレクトでループを発生させる
    let callCount = 0
    server.use(
      http.get(`${BASE_URL}/api/users/me`, () => {
        callCount++
        return new HttpResponse(null, {
          status: 302,
          headers: { Location: `${BASE_URL}/api/users/me` },
        })
      }),
    )
    const client = new CosenseRestClient({ sid: TEST_SID, timeout: 10000 })
    await expect(client.getMe()).rejects.toThrow("リダイレクトの上限")
    // MAX_REDIRECTS=5 なので 6 回目のリクエストでエラーになる
    expect(callCount).toBe(6)
  }, 15000)

  it("相対 Location ヘッダ (クエリのみ) を currentUrl 基準に解決してリダイレクトを追従する", async () => {
    // ?v=2 のような相対 URL を BASE_URL 基準で解決するとパスが消えてしまうため
    // currentUrl を基準に解決することを確認する
    let callCount = 0
    server.use(
      http.get(`${BASE_URL}/api/users/me`, () => {
        callCount++
        if (callCount === 1) {
          // クエリのみの相対 URL: currentUrl 基準なら /api/users/me?v=2 になる
          return new HttpResponse(null, {
            status: 302,
            headers: { Location: "?v=2" },
          })
        }
        return HttpResponse.json(meFixture)
      }),
    )
    const client = new CosenseRestClient({ sid: TEST_SID })
    const me = await client.getMe()
    expect(me.name).toBe("テストユーザー")
    expect(callCount).toBe(2)
  })
})
