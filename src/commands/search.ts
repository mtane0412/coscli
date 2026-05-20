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
import { writeErrorJson, writeJson } from "@/presenter/json"
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
    if (a.vector && a.limit !== undefined) {
      writeErrorJson(
        "LIMIT_NOT_SUPPORTED_WITH_VECTOR",
        "--limit は --vector と組み合わせて使用できません",
        "ベクトル検索では件数指定はできません。キーワード検索 (--vector なし) で --limit を使用してください",
      )
      process.exit(5)
      throw new Error("LIMIT_NOT_SUPPORTED_WITH_VECTOR")
    }

    const client = await buildRestClient(a)

    if (a.vector) {
      const result = await client.searchVectorTitles(project, a.query)

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
