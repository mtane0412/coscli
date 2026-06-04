/**
 * page/history.ts — `cos page history` コマンド。
 *
 * ページのコミット履歴 (GET /api/commits/:project/:pageid) を取得して出力する。
 * - `<title>` を指定した場合: getPage でタイトルから pageId を解決してから getPageCommits を呼ぶ
 * - `--page-id <pageId>` を指定した場合: title → pageId 解決をスキップして直接 getPageCommits を呼ぶ
 *   リネーム後も変更履歴を追跡できる。
 * - `--since <commitId>` を指定した場合: その commitId より後（新しい）のコミットのみを返す
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  handleRestError,
  requireProject,
} from "@/commands/_shared"
import { getPage, getPageCommits } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

/** pageHistoryCommand はページのコミット履歴を取得するコマンドを返す。 */
export const pageHistoryCommand = defineCommand({
  meta: { name: "history", description: "ページのコミット履歴を取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル (--page-id を指定した場合は省略可)",
      required: false,
    },
    "page-id": {
      type: "string",
      description: "ページ ID (指定するとタイトル解決をスキップしてリネーム後も追跡できる)",
    },
    since: {
      type: "string",
      description: "この commitId より後（新しい）のコミットのみを返す",
    },
    limit: {
      type: "string",
      alias: "n",
      description: "取得するコミット数の上限 (CLI 側スライス)",
    },
    head: {
      type: "string",
      description: "先頭コミット ID (?head=<commitId> クエリに使用)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title?: string
      "page-id"?: string
      since?: string
      limit?: string
      head?: string
    }
    checkSandbox("page.history", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // title か --page-id のどちらかが必須
    const pageId = a["page-id"]
    if (!pageId && !a.title) {
      writeErrorJson(
        "VALIDATION_ERROR",
        "title または --page-id が指定されていません",
        "ページタイトルまたは --page-id を指定してください",
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    // --limit の検証 (正の整数のみ受け付ける)
    let limit: number | undefined
    if (a.limit !== undefined) {
      const parsed = Number(a.limit)
      if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== a.limit) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--limit の値が不正です: ${a.limit}`,
          "1 以上の整数を指定してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }
      limit = parsed
    }

    try {
      const client = await buildRestClient(a)

      let resolvedPageId: string
      if (pageId) {
        // --page-id 指定時は title → pageId 解決をスキップ
        resolvedPageId = pageId
      } else {
        // title → pageId 解決
        const page = await getPage(client, { project, title: a.title as string })
        resolvedPageId = page.id
      }

      // コミット履歴取得
      const opts: { project: string; pageId: string; head?: string } = {
        project,
        pageId: resolvedPageId,
      }
      if (a.head !== undefined) opts.head = a.head

      const commitsResponse = await getPageCommits(client, opts)

      // --since によるフィルタリング: 指定 commitId より後（新しい）のコミットのみ返す
      // commits は新しい順（最新→古い）で並んでいるため、
      // 指定 commitId のインデックスより前（配列の先頭側）を返す
      let commits = commitsResponse.commits
      if (a.since !== undefined) {
        const sinceIndex = commits.findIndex((c) => c.id === a.since)
        if (sinceIndex >= 0) {
          commits = commits.slice(0, sinceIndex)
        }
        // sinceIndex が -1 の場合（見つからない）は全件返す
      }

      // --limit によるスライス
      if (limit !== undefined) {
        commits = commits.slice(0, limit)
      }

      if (a.json || !a.plain) {
        writeJson({ commits }, { command: "page.history", startTime }, buildJsonOpts(a))
        return
      }

      // plain 出力: TSV（ヘッダー行 + データ行）
      writeTsv(
        ["id", "created", "userId", "changes"],
        commits.map((c) => [
          c.id,
          new Date(c.created * 1000).toISOString(),
          c.userId,
          String(c.changes.length),
        ]),
      )
    } catch (err) {
      handleRestError(err, { resourceKind: "page", resourceName: pageId ?? a.title ?? "" })
      throw err
    }
  },
})
