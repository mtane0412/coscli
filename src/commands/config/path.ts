/**
 * config/path.ts — `cos config path` コマンド。
 *
 * 設定ファイルのパスを出力する。
 * エディタで直接開きたい場合などに使う。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import { defaultConfigPath } from "@/infra/config"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const configPathCommand = defineCommand({
  meta: { description: "設定ファイルのパスを表示する" },
  args: { ...commonArgs },
  run({ args }) {
    const a = args as CommonArgs
    checkSandbox("config.path", a)
    const logger = buildLogger(a)
    const path = defaultConfigPath()
    const startTime = Date.now()

    logger.verbose(`設定ファイル: ${path}`)

    if (a.json) {
      writeJson({ path }, { command: "config.path", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${path}\n`)
  },
})
