/**
 * msw.test.ts — useMswServer ヘルパーのテスト。
 *
 * msw モックサーバーのライフサイクル管理ヘルパーが正しく動作することを検証する。
 */

import { describe, expect, it } from "bun:test"
import { http, HttpResponse } from "msw"
import { useMswServer } from "./msw"

const server = useMswServer([
  http.get("https://example.test/api/initial", () => {
    return HttpResponse.json({ メッセージ: "初期ハンドラー応答" })
  }),
])

describe("useMswServer", () => {
  it("サーバーオブジェクトに use / resetHandlers / close メソッドが存在する", () => {
    expect(typeof server.use).toBe("function")
    expect(typeof server.resetHandlers).toBe("function")
    expect(typeof server.close).toBe("function")
  })

  it("初期ハンドラーが登録済みで fetch でレスポンスを受け取れる", async () => {
    const res = await fetch("https://example.test/api/initial")
    const body = await res.json()
    expect(body).toEqual({ メッセージ: "初期ハンドラー応答" })
  })

  it("use で動的にハンドラーを追加できる", async () => {
    server.use(
      http.get("https://example.test/api/dynamic", () => {
        return HttpResponse.json({ 動的: true })
      }),
    )
    const res = await fetch("https://example.test/api/dynamic")
    const body = await res.json()
    expect(body).toEqual({ 動的: true })
  })

  it("各テスト後にハンドラーがリセットされている (動的ハンドラーはクリアされている)", async () => {
    // 前のテストで use した動的ハンドラーは afterEach でリセット済みのため、
    // unhandled request となり接続拒否エラーがスローされる
    let threw = false
    try {
      await fetch("https://example.test/api/dynamic")
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})
