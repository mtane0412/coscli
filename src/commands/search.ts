/**
 * search.ts — `cos search <query>` コマンド。
 *
 * プロジェクト内のページをキーワード検索する。
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
import { writeJson } from "@/presenter/json"
import { writePlainList, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

export const searchCommand = defineCommand({
  meta: { description: "ページをキーワード検索する" },
  args: {
    ...commonArgs,
    query: {
      type: "positional",
      description: "検索キーワード",
      required: true,
    },
    limit: {
      type: "string",
      description: "最大件数",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { query: string; limit?: string }
    checkSandbox("search", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    logger.info(`"${a.query}" を検索中...`)

    const client = await buildRestClient(a)
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
