/**
 * project/stream.ts — `cos project stream [<name>]` コマンド。
 *
 * /api/stream/:projectname/ を叩いてプロジェクトの最近更新フィードを取得する。
 * --watch フラグを指定すると一定間隔でポーリングし、新規イベントを NDJSON で流す。
 *
 * 終了コード:
 *   0   正常終了 (SIGINT 含む)
 *   2   認証エラー
 *   3   権限エラー
 *   4   プロジェクト未発見
 *   5   バリデーションエラー
 *   7   sandbox 違反
 *   124 タイムアウト
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  handleRestError,
  requireProject,
} from "@/commands/_shared"
import { RateLimitError } from "@/core/api/rest"
import { writeErrorJson, writeJson, writeJsonLine } from "@/presenter/json"
import { writePlainTable, writeTsv } from "@/presenter/plain"
import type { StreamResponse } from "@/schemas/stream"
import { defineCommand } from "citty"

/** ProjectStreamRestClient は stream コマンドが REST 呼び出しに使用する最小 interface。 */
export interface ProjectStreamRestClient {
  getProjectStream(project: string, opts?: { limit?: number }): Promise<StreamResponse>
}

/**
 * ProjectStreamDeps は makeProjectStreamCommand に渡す依存オブジェクト。
 *
 * テスト時にモックを注入できるようにするための DI interface。
 * 指定しないフィールドは本番実装にフォールバックする。
 */
export interface ProjectStreamDeps {
  /** REST クライアント (省略時: buildRestClient で生成) */
  restClient?: ProjectStreamRestClient
  /** AbortSignal 対応 sleep (省略時: sleepWithSignal) */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

/**
 * sleepWithSignal は AbortSignal が abort されたとき即 resolve する sleep。
 *
 * watch モードのポーリング間隔の待機に使用する。
 * abort 後は Promise を resolve して即座にループを抜けられるようにする。
 */
async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/** formatTimestamp は UnixTime (秒) を ISO 8601 形式の文字列に変換する。 */
function formatTimestamp(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString()
}

/**
 * makeProjectStreamCommand は ProjectStreamDeps を受け取り、citty コマンドを返すファクトリ。
 *
 * deps を省略すると本番実装 (実際の REST API 呼び出し) を使用する。
 * テスト時は deps にモックを渡してフローを検証する。
 */
export function makeProjectStreamCommand(deps: ProjectStreamDeps = {}) {
  return defineCommand({
    meta: {
      name: "stream",
      description: "プロジェクトの最近更新フィードを取得する (--watch でポーリング監視)",
    },
    args: {
      ...commonArgs,
      name: {
        type: "positional",
        description: "プロジェクト名 (省略時は --project フラグを使用)",
        required: false,
      },
      limit: {
        type: "string",
        description: "取得件数の上限",
      },
      watch: {
        type: "boolean",
        description: "ポーリングして新規イベントを継続出力する",
        default: false,
      },
      interval: {
        type: "string",
        description: "watch モードのポーリング間隔 (秒, デフォルト: 30)",
        default: "30",
      },
      timeout: {
        type: "string",
        description: "watch モードのタイムアウト秒数 (0 = 無限, デフォルト: 0)",
        default: "0",
      },
    },
    async run({ args }) {
      const a = args as CommonArgs & {
        name?: string
        limit?: string
        watch: boolean
        interval: string | number
        timeout: string | number
      }
      const logger = buildLogger(a)
      const startTime = Date.now()

      // 1. sandbox チェック
      checkSandbox("project.stream", a)

      // 2. --limit バリデーション
      let limitOpts: { limit?: number } = {}
      if (a.limit !== undefined) {
        const limitNum = Number(a.limit)
        if (!Number.isInteger(limitNum) || limitNum < 1) {
          writeErrorJson(
            "VALIDATION_ERROR",
            `--limit に不正な値が指定されました: "${a.limit}"`,
            "--limit には 1 以上の整数を指定してください",
          )
          process.exit(5)
          throw new Error("VALIDATION_ERROR")
        }
        limitOpts = { limit: limitNum }
      }

      // 3. watch モード固有のバリデーション
      if (a.watch) {
        const intervalSec = Number(a.interval)
        if (Number.isNaN(intervalSec) || intervalSec < 1) {
          writeErrorJson(
            "VALIDATION_ERROR",
            `--interval に不正な値が指定されました: "${a.interval}"`,
            "--interval には 1 以上の数値を指定してください (レート保護のため最小 1 秒)",
          )
          process.exit(5)
          throw new Error("VALIDATION_ERROR")
        }
        const timeoutSec = Number(a.timeout)
        if (Number.isNaN(timeoutSec) || timeoutSec < 0) {
          writeErrorJson(
            "VALIDATION_ERROR",
            `--timeout に不正な値が指定されました: "${a.timeout}"`,
            "--timeout には 0 以上の数値を指定してください",
          )
          process.exit(5)
          throw new Error("VALIDATION_ERROR")
        }
      }

      // 4. プロジェクト名解決
      const project = a.name ?? requireProject(a)

      // 5. REST クライアント生成
      const client: ProjectStreamRestClient =
        deps.restClient !== undefined ? deps.restClient : await buildRestClient(a)
      const sleepFn = deps.sleep ?? sleepWithSignal

      // 6. snapshot モード
      if (!a.watch) {
        let result: StreamResponse
        try {
          result = await client.getProjectStream(project, limitOpts)
        } catch (err) {
          handleRestError(err, { resourceKind: "project", resourceName: project })
          throw err
        }

        if (a.json) {
          writeJson(result, { command: "project.stream", startTime }, buildJsonOpts(a))
          return
        }

        if (a.plain) {
          writeTsv(
            ["created", "type", "pageId", "userId"],
            result.events.map((e) => [formatTimestamp(e.created), e.type, e.pageId, e.userId]),
          )
          return
        }

        writePlainTable(
          ["作成日時", "種別", "ページID", "ユーザーID"],
          result.events.map((e) => [formatTimestamp(e.created), e.type, e.pageId, e.userId]),
        )
        return
      }

      // 7. watch モード
      const intervalSec = Number(a.interval)
      const timeoutSec = Number(a.timeout)
      const intervalMs = intervalSec * 1000

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

      // 既知イベント ID → updated のマップ (重複排除 + TTL ベースのメモリ抑制)
      const seenEvents = new Map<string, number>()
      // ベースライン確立フラグ (初回 fetch 完了で true になる)
      let baselined = false
      let lastUpdated = 0

      logger.info(`プロジェクト "${project}" のフィードを監視中... (Ctrl+C で停止)`)

      try {
        while (!ac.signal.aborted) {
          let stream: StreamResponse
          try {
            stream = await client.getProjectStream(project, limitOpts)
          } catch (err) {
            if (err instanceof RateLimitError) {
              // 429 は警告を出して次サイクルまで継続
              writeJsonLine({
                error: {
                  code: "RATE_LIMITED",
                  message: "レート制限を検出、次サイクルまで待機します",
                },
              })
              await sleepFn(intervalMs, ac.signal)
              continue
            }
            handleRestError(err, { resourceKind: "project", resourceName: project })
            throw err
          }

          if (!baselined) {
            // 初回: ベースライン化のみ (既存イベントは出力しない)
            baselined = true
            if (stream.events.length > 0) {
              lastUpdated = Math.max(...stream.events.map((e) => e.updated))
              for (const e of stream.events) {
                seenEvents.set(e.id, e.updated)
              }
            }
            // イベントがない場合は lastUpdated を 0 のままにする
            // (次ポーリングで差分検出ブランチに入り全イベントを出力する)
          } else {
            // 差分検出: 新規イベントのみ updated 昇順で出力
            const fresh = stream.events
              .filter((e) => !seenEvents.has(e.id) && e.updated >= lastUpdated)
              .sort((a, b) => a.updated - b.updated)

            for (const event of fresh) {
              if (a.plain) {
                writeTsv(
                  ["created", "type", "pageId", "userId"],
                  [[formatTimestamp(event.created), event.type, event.pageId, event.userId]],
                  { noHeader: true },
                )
              } else {
                writeJsonLine(event)
              }
              seenEvents.set(event.id, event.updated)
              if (event.updated > lastUpdated) lastUpdated = event.updated
            }

            // seenEvents のメモリ抑制: lastUpdated より 1 時間以上古い ID を削除
            const toEvict: string[] = []
            for (const [id, updated] of seenEvents) {
              if (updated < lastUpdated - 3600) toEvict.push(id)
            }
            for (const id of toEvict) seenEvents.delete(id)
          }

          if (ac.signal.aborted) break
          await sleepFn(intervalMs, ac.signal)
        }
      } finally {
        clearTimeout(timeoutHandle)
        process.removeListener("SIGINT", sigintHandler)
      }

      process.exit(timedOut ? 124 : 0)
    },
  })
}

/** projectStreamCommand は deps なしの本番実装コマンド。 */
export const projectStreamCommand = makeProjectStreamCommand()
