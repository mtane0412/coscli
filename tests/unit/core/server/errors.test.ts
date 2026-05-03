/**
 * toHttpResponse のテスト。
 * 各例外クラスが期待する HTTP ステータスコードと error.code に変換されることを検証する。
 */

import { describe, expect, it } from "bun:test"
import {
  AuthError,
  CosenseApiError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from "@/core/api/rest"
import { PolicyError } from "@/core/sandbox"
import { toHttpResponse } from "@/core/server/errors"
import { ZodError } from "zod"

/** レスポンスボディを JSON としてパースするヘルパー。 */
async function parseBody(res: Response): Promise<{ error: { code: string; message: string } }> {
  return res.json() as Promise<{ error: { code: string; message: string } }>
}

describe("toHttpResponse", () => {
  it("AuthError は 401 AUTH_REQUIRED を返す", async () => {
    const res = toHttpResponse(new AuthError())
    expect(res.status).toBe(401)
    const body = await parseBody(res)
    expect(body.error.code).toBe("AUTH_REQUIRED")
  })

  it("ForbiddenError は 403 FORBIDDEN を返す", async () => {
    const res = toHttpResponse(new ForbiddenError())
    expect(res.status).toBe(403)
    const body = await parseBody(res)
    expect(body.error.code).toBe("FORBIDDEN")
  })

  it("NotFoundError は 404 NOT_FOUND を返す", async () => {
    const res = toHttpResponse(new NotFoundError("テストページ"))
    expect(res.status).toBe(404)
    const body = await parseBody(res)
    expect(body.error.code).toBe("NOT_FOUND")
  })

  it("RateLimitError は 429 RATE_LIMITED を返す", async () => {
    const res = toHttpResponse(new RateLimitError())
    expect(res.status).toBe(429)
    const body = await parseBody(res)
    expect(body.error.code).toBe("RATE_LIMITED")
  })

  it("CosenseApiError はステータスをそのまま使い VENDOR_ERROR を返す", async () => {
    const res = toHttpResponse(new CosenseApiError(503, "Service Unavailable"))
    expect(res.status).toBe(503)
    const body = await parseBody(res)
    expect(body.error.code).toBe("VENDOR_ERROR")
  })

  it("PolicyError は 403 POLICY_DENIED を返す", async () => {
    const res = toHttpResponse(new PolicyError("page.delete"))
    expect(res.status).toBe(403)
    const body = await parseBody(res)
    expect(body.error.code).toBe("POLICY_DENIED")
  })

  it("ZodError は 400 VALIDATION_ERROR を返す", async () => {
    const zodErr = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["title"],
        message: "必須項目",
      },
    ])
    const res = toHttpResponse(zodErr)
    expect(res.status).toBe(400)
    const body = await parseBody(res)
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  it("SyntaxError は 400 INVALID_JSON を返す", async () => {
    const res = toHttpResponse(new SyntaxError("Unexpected token"))
    expect(res.status).toBe(400)
    const body = await parseBody(res)
    expect(body.error.code).toBe("INVALID_JSON")
  })

  it("未知のエラーは 500 INTERNAL_ERROR を返す", async () => {
    const res = toHttpResponse(new Error("予期しないエラー"))
    expect(res.status).toBe(500)
    const body = await parseBody(res)
    expect(body.error.code).toBe("INTERNAL_ERROR")
  })

  it("非 Error オブジェクトは 500 INTERNAL_ERROR を返す", async () => {
    const res = toHttpResponse("文字列エラー")
    expect(res.status).toBe(500)
    const body = await parseBody(res)
    expect(body.error.code).toBe("INTERNAL_ERROR")
  })

  it("レスポンスの Content-Type は application/json", () => {
    const res = toHttpResponse(new AuthError())
    expect(res.headers.get("Content-Type")).toBe("application/json")
  })
})
