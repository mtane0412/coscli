/**
 * page/table.ts — `cos page table <title> <filename>` コマンド。
 *
 * ページ内の [table:filename] ブロックを CSV テキストで取得して stdout に出力する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { AuthError, ForbiddenError, NotFoundError } from "@/core/api/rest"
import { getTable } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageTableCommand = defineCommand({
  meta: { name: "table", description: "ページ内のテーブルを CSV で取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    filename: {
      type: "positional",
      description: "テーブルのファイル名",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; filename: string }
    checkSandbox("page.table", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    logger.info(`"${a.title}" の ${a.filename} のテーブルを取得中...`)

    try {
      const client = await buildRestClient(a)
      const csv = await getTable(client, { project, title: a.title, filename: a.filename })

      if (a.json) {
        writeJson({ csv }, { command: "page.table", startTime }, buildJsonOpts(a))
        return
      }

      process.stdout.write(`${csv}\n`)
    } catch (err) {
      if (err instanceof AuthError) {
        writeErrorJson("AUTH_ERROR", err.message, "`cos auth login` を実行してください")
        process.exit(2)
        throw err
      }
      if (err instanceof ForbiddenError) {
        writeErrorJson("FORBIDDEN", err.message, "アクセス権限を確認してください")
        process.exit(3)
        throw err
      }
      if (err instanceof NotFoundError) {
        writeErrorJson(
          "NOT_FOUND",
          err.message,
          "テーブルが見つかりません。タイトルとファイル名を確認してください",
        )
        process.exit(4)
        throw err
      }
      throw err
    }
  },
})
