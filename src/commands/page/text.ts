/**
 * page/text.ts — `cos page text <title>` コマンド。
 *
 * ページのプレーンテキスト本文を取得して stdout に出力する。
 * パイプや他ツールとの連携に使う。
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
import { getPageText } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageTextCommand = defineCommand({
  meta: { description: "ページのテキスト本文を取得する" },
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
    checkSandbox("page.text", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    logger.info(`"${a.title}" のテキストを取得中...`)

    const client = await buildRestClient(a)
    const text = await getPageText(client, { project, title: a.title })

    if (a.json) {
      writeJson({ text }, { command: "page.text", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${text}\n`)
  },
})
