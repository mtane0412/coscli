/**
 * project/search.ts — `cos project search <query>` コマンド。
 *
 * 参加プロジェクト全体を横断して query にマッチするプロジェクト一覧を返す。
 * 内部で /api/projects/search/query を叩き、結果をそのまま出力する。
 * --project は不要 (横断検索のため)。
 *
 * フラグ:
 *   --joined     : 参加プロジェクトのみ対象 (デフォルト挙動と同じ)
 *   --watch-list : ローカル config の watchlist に含まれるプロジェクトのみ返す
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
} from "@/commands/_shared"
import { loadConfig } from "@/infra/config"
import { writeErrorJson, writeJson } from "@/presenter/json"
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
    joined: {
      type: "boolean" as const,
      description: "参加プロジェクトのみを対象にする (デフォルト)",
      default: false,
    },
    "watch-list": {
      type: "boolean" as const,
      description: "ウォッチリストに登録されたプロジェクトのみを対象にする",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { query: string; joined: boolean; "watch-list": boolean }
    checkSandbox("project.search", a)
    const startTime = Date.now()

    const client = await buildRestClient(a)
    const result = await client.searchJoinedProjects(a.query)

    let projects = result.projects

    // --watch-list: ウォッチリストに含まれるプロジェクトのみフィルタリングする
    if (a["watch-list"]) {
      const config = loadConfig()
      const watchlist = config.watchlist ?? []
      if (watchlist.length === 0) {
        writeErrorJson(
          "WATCHLIST_EMPTY",
          "ウォッチリストが空です",
          "cos watch-list add <project> でプロジェクトを追加してください",
        )
        exitWithError(5, "WATCHLIST_EMPTY")
      }
      const watchlistSet = new Set(watchlist)
      projects = projects.filter((p) => watchlistSet.has(p.name))
    }

    if (a.json) {
      writeJson({ ...result, projects }, { command: "project.search", startTime }, buildJsonOpts(a))
      return
    }

    writeTsv(
      ["name", "displayName"],
      projects.map((p) => [p.name, p.displayName]),
    )
  },
})
