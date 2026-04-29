/**
 * config/get.ts — `cos config get <key>` コマンド。
 *
 * 設定ファイルから指定したキーの値を取得する。
 * キーはドット区切りのパス (例: output.color)。
 */

import { type CommonArgs, buildJsonOpts, buildLogger, commonArgs } from "@/commands/_shared"
import { getConfigValue, loadConfig } from "@/infra/config"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const configGetCommand = defineCommand({
  meta: { description: "設定値を取得する" },
  args: {
    ...commonArgs,
    key: {
      type: "positional",
      description: "設定キー (例: output.color, defaultProject)",
      required: true,
    },
  },
  run({ args }) {
    const a = args as CommonArgs & { key: string }
    const logger = buildLogger(a)
    const startTime = Date.now()

    const config = loadConfig()
    const value = getConfigValue(config, a.key)

    if (value === undefined) {
      writeErrorJson(
        "KEY_NOT_FOUND",
        `設定キー "${a.key}" が見つかりません`,
        "`cos config list` で設定一覧を確認してください",
      )
      process.exit(4)
    }

    if (a.json || !a.plain) {
      writeJson({ key: a.key, value }, { command: "config.get", startTime }, buildJsonOpts(a))
      return
    }

    logger.verbose(`${a.key} = ${JSON.stringify(value)}`)
    process.stdout.write(`${JSON.stringify(value)}\n`)
  },
})
