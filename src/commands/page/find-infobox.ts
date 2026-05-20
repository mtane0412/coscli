/**
 * page/find-infobox.ts — `cos page find-infobox` コマンド。
 *
 * table:infobox または table:cosense のテーブル記法を持つページ一覧を返す。
 * 2クエリで全文検索してマージ・dedup し、infobox 定義ページを効率的に発見できる。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { AuthError, ForbiddenError, NotFoundError } from "@/core/api/rest"
import { findInfoboxPages } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { writePlainList, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

export const pageFindInfoboxCommand = defineCommand({
  meta: { name: "find-infobox", description: "infobox 定義を持つページ一覧を取得する" },
  args: {
    ...commonArgs,
    limit: {
      type: "string",
      description: "最大取得件数（マージ後に適用）",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { limit?: string }
    checkSandbox("page.find-infobox", a)
    const project = requireProject(a)
    const startTime = Date.now()

    try {
      const findOpts: { project: string; limit?: number } = { project }
      if (a.limit !== undefined) {
        if (!/^\d+$/.test(a.limit)) {
          writeErrorJson(
            "VALIDATION_ERROR",
            `--limit の値が無効です: "${a.limit}"`,
            "1 以上の整数を指定してください",
          )
          process.exit(5)
        }
        const limit = Number(a.limit)
        if (limit < 1) {
          writeErrorJson(
            "VALIDATION_ERROR",
            `--limit の値が無効です: "${a.limit}"`,
            "1 以上の整数を指定してください",
          )
          process.exit(5)
        }
        findOpts.limit = limit
      }

      const client = await buildRestClient(a)
      const pages = await findInfoboxPages(client, findOpts)

      if (a.json) {
        writeJson({ pages }, { command: "page.find-infobox", startTime }, buildJsonOpts(a))
        return
      }

      if (a.plain) {
        writeTsv(
          ["title"],
          pages.map((p) => [p.title]),
        )
        return
      }

      writePlainList(pages.map((p) => p.title))
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
        writeErrorJson("NOT_FOUND", err.message, "プロジェクトが見つかりません")
        process.exit(4)
        throw err
      }
      throw err
    }
  },
})
