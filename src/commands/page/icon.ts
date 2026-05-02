/**
 * page/icon.ts — `cos page icon <title>` コマンド。
 *
 * ページアイコン取得 URL をローカルで算出して stdout に出力する。
 * API 呼び出しは行わない。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { buildIconUrl } from "@/core/api/encoder"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageIconCommand = defineCommand({
  meta: { description: "ページアイコン取得 URL を生成する (API 呼び出しなし)" },
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
    checkSandbox("page.icon", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    logger.verbose(`アイコン URL を生成: ${a.title}`)

    const url = buildIconUrl(project, a.title)

    if (a.json) {
      writeJson({ icon: url }, { command: "page.icon", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${url}\n`)
  },
})
