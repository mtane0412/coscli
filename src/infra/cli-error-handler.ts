/**
 * cli-error-handler.ts — CLI のトップレベルエラーハンドリング。
 *
 * citty の runMain が持つ2重エラー出力・exit code 固定の問題を回避するため、
 * runCommand を直接呼ぶ自前ラッパから使用する。
 *
 * エラークラスを分類して適切な終了コードを返す。
 * --json 指定時は writeErrorJson で envelope 形式に変換する。
 */

import { AuthError, CosenseApiError, ForbiddenError, NotFoundError } from "@/core/api/rest"
import {
  EXIT_ERROR,
  EXIT_FORBIDDEN,
  EXIT_NOT_FOUND,
  EXIT_UNAUTHORIZED,
  EXIT_VALIDATION_ERROR,
} from "@/core/exit-codes"
import { ZodError } from "zod"

/**
 * resolveExitCode はエラーの種類に応じた終了コードを返す。
 *
 * - ZodError → 5 (バリデーションエラー)
 * - AuthError → 2 (認証エラー)
 * - ForbiddenError → 3 (権限エラー)
 * - NotFoundError → 4 (NotFound)
 * - その他 → 1 (一般エラー)
 */
export function resolveExitCode(err: unknown): number {
  if (err instanceof ZodError) return EXIT_VALIDATION_ERROR
  if (err instanceof AuthError) return EXIT_UNAUTHORIZED
  if (err instanceof ForbiddenError) return EXIT_FORBIDDEN
  if (err instanceof NotFoundError) return EXIT_NOT_FOUND
  if (err instanceof CosenseApiError) return EXIT_ERROR
  return EXIT_ERROR
}

/**
 * extractErrorMessage はエラーから人間向けメッセージを取り出す。
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof ZodError) {
    return `レスポンス検証エラー: ${err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
  }
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * extractStackTrace はスタックトレースを取り出す。verbose 時のみ表示する。
 *
 * Bun バンドルの内部パス (/$bunfs/...) が含まれるため、
 * 本番バイナリ実行時はデフォルトで非表示とし、-v 以上のみ表示する。
 */
export function extractStackTrace(err: unknown): string | undefined {
  if (err instanceof Error && err.stack) return err.stack
  return undefined
}
