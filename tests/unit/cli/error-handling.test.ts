/**
 * error-handling.test.ts — CLI エラーハンドリングのユニットテスト。
 *
 * resolveExitCode が各エラークラスに対して適切な終了コードを返すことを検証する。
 */

import { describe, expect, it } from "bun:test"
import {
  AuthError,
  CosenseApiError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from "@/core/api/rest"
import {
  EXIT_ERROR,
  EXIT_FORBIDDEN,
  EXIT_NOT_FOUND,
  EXIT_UNAUTHORIZED,
  EXIT_VALIDATION_ERROR,
} from "@/core/exit-codes"
import { resolveExitCode } from "@/infra/cli-error-handler"
import { ZodError, z } from "zod"

describe("resolveExitCode", () => {
  it("ZodError は EXIT_VALIDATION_ERROR (5) を返す", () => {
    // zod の parse 失敗で生成されるエラー
    let zodErr: ZodError | undefined
    try {
      z.string().parse(123)
    } catch (e) {
      if (e instanceof ZodError) zodErr = e
    }
    expect(zodErr).toBeDefined()
    expect(resolveExitCode(zodErr)).toBe(EXIT_VALIDATION_ERROR)
  })

  it("AuthError は EXIT_UNAUTHORIZED (2) を返す", () => {
    expect(resolveExitCode(new AuthError())).toBe(EXIT_UNAUTHORIZED)
  })

  it("ForbiddenError は EXIT_FORBIDDEN (3) を返す", () => {
    expect(resolveExitCode(new ForbiddenError())).toBe(EXIT_FORBIDDEN)
  })

  it("NotFoundError は EXIT_NOT_FOUND (4) を返す", () => {
    expect(
      resolveExitCode(new NotFoundError("https://scrapbox.io/api/pages/test/存在しないページ")),
    ).toBe(EXIT_NOT_FOUND)
  })

  it("RateLimitError は EXIT_ERROR (1) を返す", () => {
    expect(resolveExitCode(new RateLimitError())).toBe(EXIT_ERROR)
  })

  it("その他の CosenseApiError は EXIT_ERROR (1) を返す", () => {
    expect(resolveExitCode(new CosenseApiError(500, "サーバーエラー"))).toBe(EXIT_ERROR)
  })

  it("未知の Error は EXIT_ERROR (1) を返す", () => {
    expect(resolveExitCode(new Error("予期しないエラー"))).toBe(EXIT_ERROR)
  })

  it("文字列エラーは EXIT_ERROR (1) を返す", () => {
    expect(resolveExitCode("予期しない文字列エラー")).toBe(EXIT_ERROR)
  })
})
