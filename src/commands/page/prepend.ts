/**
 * page/prepend.ts — `cos page prepend <title>` コマンド。
 *
 * ページのタイトル行直後に行を挿入する。
 * --line で直接テキスト指定、- で stdin から読み込む。
 */

import {
  type StrictNotationArg,
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  readWriteInput,
  requireProject,
  runNotationLint,
  strictNotationArg,
  unsafeReadArg,
} from "@/commands/_shared"
import { prependToPage } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pagePrependCommand = defineCommand({
  meta: { name: "prepend", description: "ページ先頭 (タイトル直後) に行を挿入する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
    ...strictNotationArg,
    ...unsafeReadArg,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    line: {
      type: "string",
      description: "挿入する行テキスト (複数行は \\n で区切る)",
    },
    "from-file": {
      type: "string",
      description: "挿入行のファイルパス (- で stdin)",
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs &
      StrictNotationArg & {
        title: string
        line?: string
        "from-file"?: string
        "allow-unsafe-read": boolean
      }
    checkSandbox("page.prepend", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    const lines = readWriteInput(a, {
      requireContentErrorCode: "CONTENT_REQUIRED",
      requireContentMessage: "挿入する行が指定されていません",
      requireContentHint: "--line または --from-file でコンテンツを指定してください",
    })
    const warnings = runNotationLint(lines, a)

    logger.info(`"${a.title}" の先頭に行を挿入中...`)

    const writer = await buildWriter(a)
    const result = await prependToPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.prepend", startTime, warnings }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" の先頭に挿入しました`)
  },
})
