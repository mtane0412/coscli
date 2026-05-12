/**
 * page/append.ts — `cos page append <title>` コマンド。
 *
 * ページ末尾に行を追加する。
 * --line で直接テキスト指定、- で stdin から読み込む。
 */

import { readFileSync } from "node:fs"
import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  isStdinPath,
  requireProject,
} from "@/commands/_shared"
import { appendToPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageAppendCommand = defineCommand({
  meta: { name: "append", description: "ページ末尾に行を追加する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
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
    const a = args as WriteCommonArgs & { title: string; line?: string; "from-file"?: string }
    checkSandbox("page.append", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    let lines: string[] = []
    if (a.line !== undefined) {
      lines = a.line.split(/\r?\n|\\n/)
    } else if (isStdinPath(a["from-file"])) {
      const content = readFileSync(0, "utf-8")
      lines = content.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)
    } else if (a["from-file"]) {
      const content = readFileSync(a["from-file"], "utf-8")
      lines = content.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)
    }

    if (lines.length === 0) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "追加する行が指定されていません",
        "--line または --from-file でコンテンツを指定してください",
      )
      process.exit(5)
    }

    logger.info(`"${a.title}" に行を追加中...`)

    const writer = await buildWriter(a)
    const result = await appendToPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.append", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" に追加しました`)
  },
})
