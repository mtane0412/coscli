/**
 * watch-list/list.ts — `cos watch-list list` コマンド。
 *
 * ローカル config に保存されたウォッチリストのプロジェクト名を一覧表示する。
 */

import { type CommonArgs, buildJsonOpts, checkSandbox, commonArgs } from "@/commands/_shared"
import { loadConfig } from "@/infra/config"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const watchListListCommand = defineCommand({
  meta: {
    name: "list",
    description: "ウォッチリストのプロジェクト一覧を表示する",
  },
  args: {
    ...commonArgs,
  },
  async run({ args }) {
    const a = args as CommonArgs
    checkSandbox("watch-list.list", a)
    const startTime = Date.now()

    const config = loadConfig()
    const watchlist = config.watchlist ?? []

    if (a.json) {
      writeJson({ watchlist }, { command: "watch-list.list", startTime }, buildJsonOpts(a))
      return
    }

    for (const project of watchlist) {
      process.stdout.write(`${project}\n`)
    }
  },
})
