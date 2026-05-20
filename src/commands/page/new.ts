/**
 * page/new.ts — `cos page new <title>` コマンド。
 *
 * 新しいページを作成する。
 * --from-file でファイルから、- で stdin から本文を読み込む。
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
import { createPage } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageNewCommand = defineCommand({
  meta: { name: "new", description: "新しいページを作成する" },
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
    "from-file": {
      type: "string",
      description: "本文ファイルパス (- で stdin)",
    },
    line: {
      type: "string",
      description:
        "追加する行テキスト。複数行は \\n で区切るか、--line を複数回指定する (例: --line 行1 --line 行2)",
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs &
      StrictNotationArg & {
        title: string
        "from-file"?: string
        "allow-unsafe-read": boolean
        /** citty が --line を複数回受け取ると string[] になる */
        line?: string | string[]
      }
    checkSandbox("page.new", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    const lines = readWriteInput(a, {
      requireContentErrorCode: "CONTENT_REQUIRED",
      requireContentMessage: "ページ本文が指定されていません",
      requireContentHint: "--from-file または --line でコンテンツを指定してください",
    })
    const warnings = runNotationLint(lines, a)

    const writer = await buildWriter(a)
    const result = await createPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.new", startTime, warnings }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を作成しました`)
  },
})
