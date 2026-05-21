/**
 * watch-list/remove.ts — `cos watch-list remove <project>` コマンド。
 *
 * ローカル config の watchlist からプロジェクト名を削除する。
 * 存在しない場合は exit 4 で終了する。
 */

import { type CommonArgs, checkSandbox, commonArgs, exitWithError } from "@/commands/_shared"
import { loadConfig, saveConfig } from "@/infra/config"
import { defineCommand } from "citty"

export const watchListRemoveCommand = defineCommand({
  meta: {
    name: "remove",
    description: "プロジェクトをウォッチリストから削除する",
  },
  args: {
    ...commonArgs,
    project_name: {
      type: "positional" as const,
      description: "削除するプロジェクト名",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { project_name: string }
    checkSandbox("watch-list.remove", a)

    const config = loadConfig()
    const current = config.watchlist ?? []

    if (!current.includes(a.project_name)) {
      exitWithError(4, `ウォッチリストに "${a.project_name}" は登録されていません`)
    }

    saveConfig({ ...config, watchlist: current.filter((p) => p !== a.project_name) })
  },
})
