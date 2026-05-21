/**
 * watch-list/add.ts — `cos watch-list add <project>` コマンド。
 *
 * ローカル config の watchlist にプロジェクト名を追加する。
 * すでに存在する場合は何もしない（重複防止）。
 */

import { type CommonArgs, checkSandbox, commonArgs } from "@/commands/_shared"
import { loadConfig, saveConfig } from "@/infra/config"
import { defineCommand } from "citty"

export const watchListAddCommand = defineCommand({
  meta: {
    name: "add",
    description: "プロジェクトをウォッチリストに追加する",
  },
  args: {
    ...commonArgs,
    project_name: {
      type: "positional" as const,
      description: "追加するプロジェクト名",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { project_name: string }
    checkSandbox("watch-list.add", a)

    const config = loadConfig()
    const current = config.watchlist ?? []

    // すでに存在する場合は何もしない
    if (current.includes(a.project_name)) return

    saveConfig({ ...config, watchlist: [...current, a.project_name] })
  },
})
