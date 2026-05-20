/**
 * page/history.ts — `cos page history <title>` コマンド。
 *
 * ページのコミット履歴 (GET /api/commits/:project/:pageid) を取得して出力する。
 * まず getPage でタイトルから pageId を解決し、getPageCommits で履歴を取得する。
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
import { defineCommand } from "citty"

/** pageHistoryCommand はページのコミット履歴を取得するコマンドを返す。 */
export const pageHistoryCommand = defineCommand({
  meta: { name: "history", description: "ページのコミット履歴を取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
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
    const a = args as CommonArgs & { title: string; limit?: string; head?: string }
    checkSandbox("page.history", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // title の空文字チェック (positional は required でも空文字が来うる)
    if (!a.title) {
      writeErrorJson(
        "VALIDATION_ERROR",
        "title が指定されていません",
        "ページタイトルを指定してください",
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

      // title → pageId 解決
      const page = await getPage(client, { project, title: a.title })

      // コミット履歴取得
      const opts: { project: string; pageId: string; head?: string } = {
        project,
        pageId: page.id,
      }
      if (a.head !== undefined) opts.head = a.head

      const commitsResponse = await getPageCommits(client, opts)

      // --limit によるスライス
      const commits =
        limit !== undefined ? commitsResponse.commits.slice(0, limit) : commitsResponse.commits

      if (a.json || !a.plain) {
        writeJson({ commits }, { command: "page.history", startTime }, buildJsonOpts(a))
        return
      }

      // plain 出力: 1 コミット 1 行
      for (const commit of commits) {
        const date = new Date(commit.created * 1000).toISOString().replace("T", " ").slice(0, 19)
        process.stdout.write(
          `${commit.id}  ${date}  user=${commit.userId}  changes=${commit.changes.length}\n`,
        )
      }
    } catch (err) {
      handleRestError(err, { resourceKind: "page", resourceName: a.title })
      throw err
    }
  },
})
