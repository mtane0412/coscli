/**
 * page/append.ts — `cos page append <title>` コマンド。
 *
 * ページ末尾に行を追加する。
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
import { appendToPage } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageAppendCommand = defineCommand({
  meta: { name: "append", description: "ページ末尾に行を追加する" },
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
      description: "追加する行テキスト (複数行は \\n で区切る)",
    },
    "from-file": {
      type: "string",
      description: "追加行のファイルパス (- で stdin)",
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
    checkSandbox("page.append", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    const lines = readWriteInput(a, {
      requireContentErrorCode: "CONTENT_REQUIRED",
      requireContentMessage: "追加する行が指定されていません",
      requireContentHint: "--line または --from-file でコンテンツを指定してください",
    })
    const warnings = runNotationLint(lines, a)

    logger.info(`"${a.title}" に行を追加中...`)

    const writer = await buildWriter(a)
    const result = await appendToPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.append", startTime, warnings }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" に追加しました`)
  },
})
