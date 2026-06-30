/**
 * page/url.ts — `cos page url <title>` コマンド。
 *
 * @deprecated `cos page get <title> --format=url` を使用してください。
 *
 * ページの URL をローカルで算出して stdout に出力する。
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
import { buildPageUrl } from "@/core/api/encoder"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageUrlCommand = defineCommand({
  meta: { name: "url", description: "ページの URL を生成する (API 呼び出しなし)" },
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
    checkSandbox("page.url", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    const warnings: string[] = []
    warnDeprecated("page url", "page get --format=url", warnings)

    logger.verbose(`URL を生成: ${a.title}`)

    const url = buildPageUrl(project, a.title)

    if (a.json) {
      writeJson(
        { url },
        {
          command: "page.url",
          startTime,
          warnings,
          canonicalCommand: "page.get",
          deprecated: { since: DEPRECATION_SINCE, replacement: "page get --format=url" },
        },
        buildJsonOpts(a),
      )
      return
    }

    process.stdout.write(`${url}\n`)
  },
})
