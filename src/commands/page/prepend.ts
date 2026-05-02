/**
 * page/prepend.ts — `cos page prepend <title>` コマンド。
 *
 * ページのタイトル行直後に行を挿入する。
 * --line で直接テキスト指定、- で stdin から読み込む。
 */

import { readFileSync } from "node:fs"
import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { prependToPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pagePrependCommand = defineCommand({
  meta: { description: "ページ先頭 (タイトル直後) に行を挿入する" },
  args: {
    ...commonArgs,
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
    const a = args as CommonArgs & { title: string; line?: string; "from-file"?: string }
    checkSandbox("page.prepend", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    let lines: string[] = []
    if (a.line) {
      lines = a.line.split("\\n")
    } else if (a["from-file"] === "-") {
      const content = readFileSync(0, "utf-8")
      lines = content.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)
    } else if (a["from-file"]) {
      const content = readFileSync(a["from-file"], "utf-8")
      lines = content.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)
    }

    if (lines.length === 0) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "挿入する行が指定されていません",
        "--line または --from-file でコンテンツを指定してください",
      )
      process.exit(5)
    }

    logger.info(`"${a.title}" の先頭に行を挿入中...`)

    const writer = await buildWriter(a)
    const result = await prependToPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.prepend", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" の先頭に挿入しました`)
  },
})
