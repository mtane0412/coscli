/**
 * page/get.ts — `cos page get <title>` コマンド。
 *
 * 指定したタイトルのページ詳細 (行データ、メタ情報) を取得して出力する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { getPage } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageGetCommand = defineCommand({
  meta: { description: "ページ詳細を取得する" },
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
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    logger.info(`"${a.title}" を取得中...`)

    const client = await buildRestClient(a)
    const page = await getPage(client, { project, title: a.title })

    if (a.json || !a.plain) {
      writeJson(page, { command: "page.get", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${page.title}\n`)
    for (const line of page.lines) {
      process.stdout.write(`${line.text}\n`)
    }
  },
})
