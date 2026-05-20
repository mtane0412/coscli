/**
 * project/search.ts — `cos project search <query>` コマンド。
 *
 * 参加プロジェクト全体を横断して query にマッチするプロジェクト一覧を返す。
 * 内部で /api/projects/search/query を叩き、結果をそのまま出力する。
 * --project は不要 (横断検索のため)。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import { writeJson } from "@/presenter/json"
import { writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

export const projectSearchCommand = defineCommand({
  meta: {
    name: "search",
    description: "参加プロジェクト全体を横断してマッチするプロジェクトを検索する",
  },
  args: {
    ...commonArgs,
    query: {
      type: "positional",
      description: "検索キーワード",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { query: string }
    checkSandbox("project.search", a)
    const startTime = Date.now()

    const client = await buildRestClient(a)
    const result = await client.searchJoinedProjects(a.query)

    if (a.json) {
      writeJson(result, { command: "project.search", startTime }, buildJsonOpts(a))
      return
    }

    writeTsv(
      ["name", "displayName"],
      result.projects.map((p) => [p.name, p.displayName]),
    )
  },
})
