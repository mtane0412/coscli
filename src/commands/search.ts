/**
 * search.ts — `cos search <query>` コマンド。
 *
 * プロジェクト内のページを検索する。
 * デフォルトはキーワード検索。--vector フラグでベクトル検索（意味的類似度）に切り替わる。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { writeJson } from "@/presenter/json"
import { writePlainList, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

export const searchCommand = defineCommand({
  meta: { name: "search", description: "ページを検索する" },
  args: {
    ...commonArgs,
    query: {
      type: "positional",
      description: "検索クエリ",
      required: true,
    },
    limit: {
      type: "string",
      description: "最大件数 (キーワード検索のみ)",
    },
    vector: {
      type: "boolean",
      description: "ベクトル検索 (意味的類似度) を使用する",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { query: string; limit?: string; vector: boolean }
    checkSandbox("search", a)
    const project = requireProject(a)
    const startTime = Date.now()
    const client = await buildRestClient(a)

    if (a.vector) {
      const result = await client.searchVectorTitles(project, a.query)
      // --limit 指定時はクライアント側で件数を切り詰める
      const pages = a.limit ? result.pages.slice(0, Number(a.limit)) : result.pages

      if (a.json) {
        writeJson({ pages }, { command: "search", startTime }, buildJsonOpts(a))
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
      return
    }

    const searchOpts: { limit?: number } = {}
    if (a.limit) searchOpts.limit = Number(a.limit)
    const result = await client.searchPages(project, a.query, searchOpts)

    if (a.json) {
      writeJson(result, { command: "search", startTime }, buildJsonOpts(a))
      return
    }

    if (a.plain) {
      writeTsv(
        ["title"],
        result.pages.map((p) => [p.title]),
      )
      return
    }

    writePlainList(result.pages.map((p) => p.title))
  },
})
