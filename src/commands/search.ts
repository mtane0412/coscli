/**
 * search.ts — `cos search <query>` コマンド。
 *
 * --joined なし: プロジェクト内のページをキーワード検索する。
 * --joined あり: 参加プロジェクト全体を横断してマッチするプロジェクト一覧を返す。
 *   --joined と --project / COS_PROJECT は排他 (同時指定は exit 5)。
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
import { writeErrorJson, writeJson } from "@/presenter/json"
import { writePlainList, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

export const searchCommand = defineCommand({
  meta: { name: "search", description: "ページをキーワード検索する" },
  args: {
    ...commonArgs,
    query: {
      type: "positional",
      description: "検索キーワード",
      required: true,
    },
    limit: {
      type: "string",
      description: "最大件数 (プロジェクト内検索時のみ有効)",
    },
    joined: {
      type: "boolean",
      description: "参加プロジェクト全体を横断してマッチするプロジェクトを検索する",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { query: string; limit?: string; joined: boolean }
    checkSandbox("search", a)
    const logger = buildLogger(a)
    const startTime = Date.now()

    if (a.joined) {
      // --joined と --project / COS_PROJECT の同時指定は排他
      const projectFromEnv = process.env["COS_PROJECT"]
      if (a.project || projectFromEnv) {
        writeErrorJson(
          "PROJECT_AND_JOINED_EXCLUSIVE",
          "--joined と --project は同時に指定できません",
          "--joined 使用時は --project および COS_PROJECT 環境変数を外してください",
        )
        process.exit(5)
        throw new Error("PROJECT_AND_JOINED_EXCLUSIVE")
      }

      logger.info(`"${a.query}" を参加プロジェクト全体から検索中...`)

      const client = await buildRestClient(a)
      const result = await client.searchJoinedProjects(a.query)

      if (a.json) {
        writeJson(result, { command: "search", startTime }, buildJsonOpts(a))
        return
      }

      writeTsv(
        ["name", "displayName"],
        result.projects.map((p) => [p.name, p.displayName]),
      )
      return
    }

    const project = requireProject(a)
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
