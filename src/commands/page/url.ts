/**
 * page/url.ts — `cos page url <title>` コマンド。
 *
 * ページの URL をローカルで算出して stdout に出力する。
 * API 呼び出しは行わない。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { buildPageUrl } from "@/core/api/encoder"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageUrlCommand = defineCommand({
  meta: { description: "ページの URL を生成する (API 呼び出しなし)" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
  },
  run({ args }) {
    const a = args as CommonArgs & { title: string }
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    logger.verbose(`URL を生成: ${a.title}`)

    const url = buildPageUrl(project, a.title)

    if (a.json) {
      writeJson({ url }, { command: "page.url", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${url}\n`)
  },
})
