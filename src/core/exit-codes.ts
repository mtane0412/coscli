/**
 * exit-codes.ts — 終了コードの単一ソース。
 *
 * EXIT_CODES 配列はエージェント向け `cos exit-codes` コマンドの出力源であり、
 * EXIT_* 個別定数は新規コマンドで process.exit() を呼ぶ際に使用する。
 * 既存コードのハードコード置換は別 PR (chore) で対応する。
 */

/** ExitCodeEntry は終了コード 1 エントリの型定義。 */
export interface ExitCodeEntry {
  /** 終了コード番号 */
  code: number
  /** 機械可読な名前 (snake_case) */
  name: string
  /** 人間向けの日本語説明 */
  description: string
}

/** EXIT_CODES は終了コード一覧。`cos exit-codes` コマンドの出力源。 */
export const EXIT_CODES: readonly ExitCodeEntry[] = [
  { code: 0, name: "success", description: "成功" },
  { code: 1, name: "error", description: "一般エラー" },
  { code: 2, name: "unauthorized", description: "認証エラー (401)" },
  { code: 3, name: "forbidden", description: "権限エラー (403)" },
  { code: 4, name: "not_found", description: "リソースが見つからない (404)" },
  { code: 5, name: "validation_error", description: "バリデーションエラー" },
  { code: 6, name: "conflict", description: "楽観ロック競合" },
  { code: 7, name: "policy_denied", description: "sandbox ポリシー違反" },
  { code: 124, name: "timeout", description: "タイムアウト" },
] as const

/** EXIT_SUCCESS は成功を表す終了コード。 */
export const EXIT_SUCCESS = 0
/** EXIT_ERROR は一般エラーを表す終了コード。 */
export const EXIT_ERROR = 1
/** EXIT_UNAUTHORIZED は認証エラー (401) を表す終了コード。 */
export const EXIT_UNAUTHORIZED = 2
/** EXIT_FORBIDDEN は権限エラー (403) を表す終了コード。 */
export const EXIT_FORBIDDEN = 3
/** EXIT_NOT_FOUND はリソースが見つからない (404) を表す終了コード。 */
export const EXIT_NOT_FOUND = 4
/** EXIT_VALIDATION_ERROR はバリデーションエラーを表す終了コード。 */
export const EXIT_VALIDATION_ERROR = 5
/** EXIT_CONFLICT は楽観ロック競合を表す終了コード。 */
export const EXIT_CONFLICT = 6
/** EXIT_POLICY_DENIED は sandbox ポリシー違反を表す終了コード。 */
export const EXIT_POLICY_DENIED = 7
/** EXIT_TIMEOUT はタイムアウトを表す終了コード。 */
export const EXIT_TIMEOUT = 124
