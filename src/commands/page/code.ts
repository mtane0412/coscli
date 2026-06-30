/**
 * page/code.ts — `cos page code <title> <filename>` コマンド。
 *
 * @deprecated `cos page get <title> --format=code --filename=<filename>` を使用してください。
 *
 * ページ内のコードブロックを取得して stdout に出力する。
 */

import { DEPRECATION_SINCE, warnDeprecated } from "@/commands/_deprecation"
import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { getCodeBlock } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageCodeCommand = defineCommand({
  meta: { name: "code", description: "ページ内のコードブロックを取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    filename: {
      type: "positional",
      description: "コードブロックのファイル名",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; filename: string }
    checkSandbox("page.code", a)
    const project = requireProject(a)
    const startTime = Date.now()

    const replacement = "page get <title> --format=code --filename=<filename>"
    const warnings: string[] = []
    warnDeprecated("page code", replacement, warnings)

    const client = await buildRestClient(a)
    const code = await getCodeBlock(client, { project, title: a.title, filename: a.filename })

    if (a.json) {
      writeJson(
        { code },
        {
          command: "page.code",
          startTime,
          warnings,
          canonicalCommand: "page.get",
          deprecated: { since: DEPRECATION_SINCE, replacement },
        },
        buildJsonOpts(a),
      )
      return
    }

    process.stdout.write(`${code}\n`)
  },
})
