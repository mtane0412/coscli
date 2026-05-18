/**
 * errors.ts — coscli 固有のエラークラス定義。
 *
 * CLI のエラーハンドラ (cli-error-handler.ts) が exit code / JSON code に変換する。
 */

/**
 * PageLineError はページ行操作のバリデーションエラー。
 *
 * `replaceLinesInPage` / `deleteLinesFromPage` でタイトル行への操作や
 * 範囲外アクセスが発生した場合に throw する。
 * コマンド層が VALIDATION_ERROR (exit 5) にマップする。
 */
export class PageLineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PageLineError"
  }
}

/**
 * CommitConflictError は楽観ロック競合を表すエラー。
 *
 * `page edit` 等で他者がページを更新したことを検知した場合に throw する。
 * cli-error-handler が EXIT_CONFLICT (6) / "CONFLICT" にマップする。
 */
export class CommitConflictError extends Error {
  /** 期待していた commitId (--expect-commit で指定した値等)。 */
  readonly expectedCommitId: string | undefined
  /** 実際の commitId (サーバーから取得した最新値)。 */
  readonly actualCommitId: string | undefined

  constructor(message: string, expectedCommitId?: string, actualCommitId?: string) {
    super(message)
    this.name = "CommitConflictError"
    this.expectedCommitId = expectedCommitId
    this.actualCommitId = actualCommitId
  }
}
