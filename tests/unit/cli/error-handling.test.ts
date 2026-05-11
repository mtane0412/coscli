/**
 * error-handling.test.ts — CLI エラーハンドリングのユニットテスト。
 *
 * resolveExitCode / resolveErrorCode / extractErrorMessage が
 * 各エラークラスに対して適切な値を返すことを検証する。
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
import { extractErrorMessage, resolveErrorCode, resolveExitCode } from "@/infra/cli-error-handler"
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

describe("resolveErrorCode", () => {
  it("ZodError は VALIDATION_ERROR を返す", () => {
    let zodErr: ZodError | undefined
    try {
      z.string().parse(123)
    } catch (e) {
      if (e instanceof ZodError) zodErr = e
    }
    expect(resolveErrorCode(zodErr)).toBe("VALIDATION_ERROR")
  })

  it("AuthError は AUTH_REQUIRED を返す", () => {
    expect(resolveErrorCode(new AuthError())).toBe("AUTH_REQUIRED")
  })

  it("ForbiddenError は FORBIDDEN を返す", () => {
    expect(resolveErrorCode(new ForbiddenError())).toBe("FORBIDDEN")
  })

  it("NotFoundError は NOT_FOUND を返す", () => {
    expect(
      resolveErrorCode(new NotFoundError("https://scrapbox.io/api/pages/test/存在しないページ")),
    ).toBe("NOT_FOUND")
  })

  it("その他のエラーは ERROR を返す", () => {
    expect(resolveErrorCode(new Error("予期しないエラー"))).toBe("ERROR")
    expect(resolveErrorCode(new CosenseApiError(500, "サーバーエラー"))).toBe("ERROR")
    expect(resolveErrorCode("文字列エラー")).toBe("ERROR")
  })
})

describe("extractErrorMessage", () => {
  it("ZodError でパスあり: 'フィールド名: メッセージ' 形式で返す", () => {
    let zodErr: ZodError | undefined
    try {
      // path が ["name"] になる ZodError を生成する
      z.object({ name: z.string() }).parse({ name: 123 })
    } catch (e) {
      if (e instanceof ZodError) zodErr = e
    }
    const msg = extractErrorMessage(zodErr)
    // "レスポンス検証エラー: name: Expected string, received number" のような形式
    expect(msg).toContain("name:")
    expect(msg).not.toMatch(/^レスポンス検証エラー: :/)
  })

  it("ZodError でパスなし: 先頭コロンなしのメッセージを返す", () => {
    let zodErr: ZodError | undefined
    try {
      // path が [] になる ZodError を生成する (トップレベルの型ミスマッチ)
      z.string().parse(123)
    } catch (e) {
      if (e instanceof ZodError) zodErr = e
    }
    const msg = extractErrorMessage(zodErr)
    // ": Expected string..." のような先頭コロン形式にならないこと
    expect(msg).not.toMatch(/レスポンス検証エラー: :/)
    expect(msg).toContain("レスポンス検証エラー:")
  })

  it("通常の Error はメッセージをそのまま返す", () => {
    expect(extractErrorMessage(new Error("通常のエラーメッセージ"))).toBe("通常のエラーメッセージ")
  })

  it("文字列はそのまま返す", () => {
    expect(extractErrorMessage("文字列エラー")).toBe("文字列エラー")
  })
})
