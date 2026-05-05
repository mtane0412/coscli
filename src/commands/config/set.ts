/**
 * config/set.ts — `cos config set <key> <value>` コマンド。
 *
 * 設定ファイルにキーと値を保存する。
 * キーはドット区切りのパス (例: output.color)。
 * 値は JSON として解釈し、失敗した場合は文字列として扱う。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import { loadConfig, saveConfig, setConfigValue } from "@/infra/config"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const configSetCommand = defineCommand({
  meta: { name: "set", description: "設定値を保存する" },
  args: {
    ...commonArgs,
    key: {
      type: "positional",
      description: "設定キー (例: output.color)",
      required: true,
    },
    value: {
      type: "positional",
      description: "設定値 (JSON または文字列)",
      required: true,
    },
  },
  run({ args }) {
    const a = args as CommonArgs & { key: string; value: string }
    checkSandbox("config.set", a)
    const logger = buildLogger(a)
    const startTime = Date.now()

    // JSON として解釈を試みる (数値・真偽値・null 対応)
    let parsedValue: unknown
    try {
      parsedValue = JSON.parse(a.value)
    } catch {
      parsedValue = a.value
    }

    const config = loadConfig()
    let updated: ReturnType<typeof setConfigValue>
    try {
      updated = setConfigValue(config, a.key, parsedValue)
    } catch (err) {
      writeErrorJson(
        "INVALID_VALUE",
        `設定値が不正です: ${err instanceof Error ? err.message : String(err)}`,
      )
      process.exit(5)
    }

    saveConfig(updated)
    logger.success(`${a.key} = ${JSON.stringify(parsedValue)} を保存しました`)

    if (a.json) {
      writeJson(
        { key: a.key, value: parsedValue },
        { command: "config.set", startTime },
        buildJsonOpts(a),
      )
    }
  },
})
