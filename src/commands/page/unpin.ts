/**
 * page/unpin.ts — `cos page unpin <title>` コマンド。
 *
 * ページのピン留めを解除する。WebSocket commit で PinChange(pin: 0) を送信する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { unpinPage } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageUnpinCommand = defineCommand({
  meta: { name: "unpin", description: "ページのピン留めを解除する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string }
    checkSandbox("page.unpin", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    logger.info(`"${a.title}" のピン留めを解除中...`)

    const writer = await buildWriter(a)
    const result = await unpinPage(writer, { project, title: a.title })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.unpin", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" のピン留めを解除しました`)
  },
})
