/**
 * errors.ts — HTTP サーバ層のエラー変換ユーティリティ。
 *
 * 各例外クラスを適切な HTTP ステータスコードと JSON エラーボディに変換する。
 * すべてのルートハンドラは catch した例外をこの関数に渡して Response を生成する。
 */

import {
  AuthError,
  CosenseApiError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from "@/core/api/rest"
import { PolicyError } from "@/core/sandbox"
import { ZodError } from "zod"

/** ErrorCode は HTTP エラーレスポンスで使用するエラーコード一覧。 */
export type ErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "VENDOR_ERROR"
  | "VALIDATION_ERROR"
  | "POLICY_DENIED"
  | "INVALID_JSON"
  | "PROXY_AUTH_REQUIRED"
  | "WRITE_DISABLED"
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_ERROR"

/** ErrorBody は HTTP エラーレスポンスのボディ形式。 */
interface ErrorBody {
  ok: false
  error: {
    code: ErrorCode
    message: string
    hint?: string
  }
}

/** buildErrorResponse は HTTP エラーレスポンスを生成する。 */
function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  hint?: string,
): Response {
  const body: ErrorBody = {
    ok: false,
    error: hint ? { code, message, hint } : { code, message },
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * toHttpResponse は任意の例外を HTTP Response に変換する。
 * ルートハンドラの catch 節から呼ぶことで統一したエラーレスポンスを返せる。
 */
export function toHttpResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return buildErrorResponse(401, "AUTH_REQUIRED", err.message)
  }
  if (err instanceof ForbiddenError) {
    return buildErrorResponse(403, "FORBIDDEN", err.message)
  }
  if (err instanceof NotFoundError) {
    return buildErrorResponse(404, "NOT_FOUND", err.message)
  }
  if (err instanceof RateLimitError) {
    return buildErrorResponse(429, "RATE_LIMITED", err.message)
  }
  // CosenseApiError のサブクラスより先に判定済みなので、ここは他の CosenseApiError
  if (err instanceof CosenseApiError) {
    return buildErrorResponse(err.status, "VENDOR_ERROR", err.message)
  }
  if (err instanceof PolicyError) {
    return buildErrorResponse(403, "POLICY_DENIED", err.message)
  }
  if (err instanceof ZodError) {
    return buildErrorResponse(400, "VALIDATION_ERROR", err.issues.map((i) => i.message).join(", "))
  }
  if (err instanceof SyntaxError) {
    return buildErrorResponse(400, "INVALID_JSON", err.message)
  }
  // 内部エラーの詳細はクライアントに漏洩させず、汎用メッセージを返す
  return buildErrorResponse(500, "INTERNAL_ERROR", "予期しないエラーが発生しました")
}
