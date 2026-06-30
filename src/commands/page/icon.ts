/**
 * page/icon.ts — `cos page icon <title>` コマンド。
 *
 * @deprecated `cos page get <title> --format=icon` を使用してください。
 *
 * ページアイコン取得 URL をローカルで算出して stdout に出力する。
 * API 呼び出しは行わない。
 */

import { DEPRECATION_SINCE, warnDeprecated } from "@/commands/_deprecation"
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
  meta: { name: "icon", description: "ページアイコン取得 URL を生成する (API 呼び出しなし)" },
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

    const warnings: string[] = []
    warnDeprecated("page icon", "page get --format=icon", warnings)

    logger.verbose(`アイコン URL を生成: ${a.title}`)

    const url = buildIconUrl(project, a.title)

    if (a.json) {
      writeJson(
        { icon: url },
        {
          command: "page.icon",
          startTime,
          warnings,
          canonicalCommand: "page.get",
          deprecated: { since: DEPRECATION_SINCE, replacement: "page get --format=icon" },
        },
        buildJsonOpts(a),
      )
      return
    }

    process.stdout.write(`${url}\n`)
  },
})
