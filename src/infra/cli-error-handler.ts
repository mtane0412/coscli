/**
 * cli-error-handler.ts — CLI のトップレベルエラーハンドリング。
 *
 * citty の runMain が持つ2重エラー出力・exit code 固定の問題を回避するため、
 * runCommand を直接呼ぶ自前ラッパから使用する。
 *
 * エラークラスを分類して適切な終了コードと JSON コードを返す。
 * --json 時の writeErrorJson 呼び出しは cli.ts 側で行う。
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
 * resolveErrorCode はエラーの種類に応じた JSON envelope 用エラーコード文字列を返す。
 *
 * resolveExitCode と同じ分類粒度で文字列コードを返すことで、
 * --json 時のエラーレスポンスで種別が判別できるようにする。
 */
export function resolveErrorCode(err: unknown): string {
  if (err instanceof ZodError) return "VALIDATION_ERROR"
  if (err instanceof AuthError) return "AUTH_REQUIRED"
  if (err instanceof ForbiddenError) return "FORBIDDEN"
  if (err instanceof NotFoundError) return "NOT_FOUND"
  return "ERROR"
}

/**
 * extractErrorMessage はエラーから人間向けメッセージを取り出す。
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof ZodError) {
    const parts = err.issues.map((e) => {
      const pathStr = e.path.join(".")
      // path が空の場合 (トップレベルの型ミスマッチ等) はパス部分を省略する
      return pathStr ? `${pathStr}: ${e.message}` : e.message
    })
    return `レスポンス検証エラー: ${parts.join(", ")}`
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
