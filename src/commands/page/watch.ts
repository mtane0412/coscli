/**
 * page/watch.ts — `cos page watch <title>` コマンド。
 *
 * 指定したページの WebSocket room に join し、commit イベントをリアルタイムで受信する。
 * --json で JSON Lines (NDJSON)、--format=diff で簡易 unified diff 風出力、
 * Ctrl+C (SIGINT) で exit 0、--timeout 秒経過で exit 124。
 */

import {
  type CommonArgs,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
  requireSid,
} from "@/commands/_shared"
import { NotFoundError } from "@/core/api/rest"
import { type ScrapboxSubscriber, createScrapboxSubscriber } from "@/core/api/subscribe"
import type { PageCommitEvent } from "@/core/api/subscribe"
import { writeErrorJson, writeJsonLine } from "@/presenter/json"
import type { Page } from "@/schemas/page"
import type { Project } from "@/schemas/project"
import { defineCommand } from "citty"

/** WatchRestClient は watch コマンドが REST 呼び出しに使用する最小 interface。 */
export interface WatchRestClient {
  getPage(project: string, title: string): Promise<Page>
  getProject(project: string): Promise<Project>
}

/**
 * WatchDeps は makePageWatchCommand に渡す依存オブジェクト。
 *
 * テスト時にモックを注入できるようにするための DI interface。
 * 指定しないフィールドは本番実装にフォールバックする。
 */
export interface WatchDeps {
  /** セッション ID 取得関数 (省略時: requireSid) */
  getSid?: (profile?: string) => Promise<string>
  /** REST クライアント (省略時: buildRestClient で生成) */
  restClient?: WatchRestClient
  /** subscriber ファクトリ (省略時: createScrapboxSubscriber) */
  createSubscriber?: () => Promise<ScrapboxSubscriber>
}

/**
 * makePageWatchCommand は WatchDeps を受け取り、citty コマンドを返すファクトリ。
 *
 * deps を省略すると本番実装 (実際の WebSocket 接続) を使用する。
 * テスト時は deps にモックを渡してフローを検証する。
 */
export function makePageWatchCommand(deps: WatchDeps = {}) {
  return defineCommand({
    meta: { name: "watch", description: "ページ更新をリアルタイム監視する (tail -f 風)" },
    args: {
      ...commonArgs,
      title: {
        type: "positional",
        description: "監視するページタイトル",
        required: true,
      },
      timeout: {
        type: "string",
        description: "タイムアウト秒数 (0 = 無限, デフォルト: 0)",
        default: "0",
      },
      format: {
        type: "string",
        description: "出力フォーマット ('' | 'diff')",
        default: "",
      },
    },
    async run({ args }) {
      const a = args as CommonArgs & { title: string; timeout: string | number; format: string }
      const logger = buildLogger(a)

      // 1. sandbox チェック
      checkSandbox("page.watch", a)

      // 2. --format バリデーション
      if (a.format !== "" && a.format !== "diff") {
        writeErrorJson(
          "VALIDATION_ERROR",
          `未対応の --format 値: "${a.format}"`,
          "--format の有効値は '' または 'diff' です",
        )
        process.exit(5)
      }
      const format = a.format as "" | "diff"

      // 4. --timeout バリデーション
      const timeoutSec = Number(a.timeout)
      if (Number.isNaN(timeoutSec) || timeoutSec < 0) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--timeout に不正な値が指定されました: "${a.timeout}"`,
          "--timeout には 0 以上の数値を指定してください",
        )
        process.exit(5)
      }

      // 5. プロジェクト解決
      const project = requireProject(a)

      // 6. sid 取得
      const getSidFn = deps.getSid ?? requireSid
      const sid = await getSidFn(a.profile)

      // 7. REST クライアント生成 (deps 未指定時は認証済みクライアントを生成)
      const restClient: WatchRestClient =
        deps.restClient !== undefined ? deps.restClient : await buildRestClient(a)

      // 8. ページ・プロジェクト情報取得 (pageId・projectId を確定)
      let page: Page
      let proj: Project
      try {
        ;[page, proj] = await Promise.all([
          restClient.getPage(project, a.title),
          restClient.getProject(project),
        ])
      } catch (err) {
        if (err instanceof NotFoundError) {
          writeErrorJson(
            "NOT_FOUND",
            `ページ "${a.title}" が見つかりません`,
            "タイトルとプロジェクト名を確認してください",
          )
          process.exit(4)
        }
        throw err
      }

      // 9. AbortController と SIGINT ハンドラを設定
      const ac = new AbortController()
      let timedOut = false

      const sigintHandler = () => {
        ac.abort()
      }
      process.once("SIGINT", sigintHandler)

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      if (timeoutSec > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true
          ac.abort()
        }, timeoutSec * 1000)
      }

      // 10. subscriber 生成と購読開始
      const createSubscriberFn = deps.createSubscriber ?? createScrapboxSubscriber
      const subscriber = await createSubscriberFn()

      logger.info(`"${a.title}" の更新を監視中... (Ctrl+C で停止)`)

      try {
        await subscriber.subscribePage(
          {
            projectId: proj.id,
            pageId: page.id,
            sid,
            signal: ac.signal,
          },
          (event) => {
            handleCommitEvent(event, a.title, format, a.json, ac)
          },
        )
      } finally {
        clearTimeout(timeoutHandle)
        process.removeListener("SIGINT", sigintHandler)
      }

      process.exit(timedOut ? 124 : 0)
    },
  })
}

/**
 * handleCommitEvent は commit イベントを受け取り、フォーマットに応じて stdout に出力する。
 *
 * DeletePageChange を検出した場合は "! page deleted" を出力して controller を abort する。
 * process.exit() を直接呼ばないことで、subscribePage の finally (ソケット切断) が確実に実行される。
 */
function handleCommitEvent(
  event: PageCommitEvent,
  title: string,
  format: "" | "diff",
  isJson: boolean,
  controller: AbortController,
): void {
  // DeletePageChange 検出: changes が [{ deleted: true }] の形式
  if (isDeletePageEvent(event)) {
    process.stdout.write("! page deleted\n")
    controller.abort()
    return
  }

  // --json: NDJSON 出力 (--format=diff より優先)
  if (isJson) {
    writeJsonLine(event)
    return
  }

  // テキスト形式出力
  const lines: string[] = []

  if (format === "diff") {
    lines.push(`--- a/${title}`)
    lines.push(`+++ b/${title}`)
  }

  // ヘッダ: [commitId 先頭 8 文字] userId receivedAt
  lines.push(`[${event.commitId.slice(0, 8)}] ${event.userId} ${event.receivedAt}`)

  for (const change of event.changes) {
    const formatted = formatSingleChange(change)
    if (formatted !== null) {
      lines.push(formatted)
    }
  }

  process.stdout.write(`${lines.join("\n")}\n`)
}

/**
 * isDeletePageEvent は commit イベントが DeletePageChange を含むかどうかを判定する。
 *
 * changes が [{ deleted: true }] の形式の場合は true を返す。
 */
function isDeletePageEvent(event: PageCommitEvent): boolean {
  const first = event.changes[0]
  if (first === undefined) return false
  return "deleted" in (first as object)
}

/**
 * formatSingleChange は 1 つの change を出力文字列に変換する。
 *
 * メタデータ変更 (LinksChange, IconsChange 等) は null を返して抑制する。
 */
function formatSingleChange(change: unknown): string | null {
  if (typeof change !== "object" || change === null) return null
  const c = change as Record<string, unknown>

  // InsertChange: { _insert: string, lines: { text: string } }
  if ("_insert" in c) {
    const lines = c["lines"] as { text: string } | undefined
    return `+ ${lines?.text ?? ""}`
  }
  // UpdateChange: { _update: string, lines: { text: string } }
  if ("_update" in c) {
    const lines = c["lines"] as { text: string } | undefined
    return `M ${lines?.text ?? ""}`
  }
  // DeleteChange: { _delete: string, lines: -1 }
  if ("_delete" in c) {
    return `- ${String(c["_delete"]).slice(0, 10)}`
  }
  // TitleChange: { title: string }
  if ("title" in c && typeof c["title"] === "string") {
    return `T ${c["title"]}`
  }
  // LinksChange / IconsChange / DescriptionsChange 等のメタデータ変更は抑制
  return null
}

/** pageWatchCommand は deps なしの本番実装コマンド。 */
export const pageWatchCommand = makePageWatchCommand()
