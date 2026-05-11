/**
 * page/new.ts — `cos page new <title>` コマンド。
 *
 * 新しいページを作成する。
 * --from-file でファイルから、- で stdin から本文を読み込む。
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
  requireProject,
} from "@/commands/_shared"
import { createPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageNewCommand = defineCommand({
  meta: { name: "new", description: "新しいページを作成する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
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
      description: "追加する行テキスト",
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs & { title: string; "from-file"?: string; line?: string }
    checkSandbox("page.new", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    let lines: string[] = []
    if (a["from-file"] === "-") {
      // stdin から読み込む
      const content = readFileSync(0, "utf-8")
      lines = content.split("\n").filter((l) => l.length > 0 || content.endsWith("\n"))
    } else if (a["from-file"]) {
      const content = readFileSync(a["from-file"], "utf-8")
      lines = content.split("\n")
    } else if (a.line) {
      lines = a.line.split("\\n")
    }

    if (lines.length === 0) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "ページ本文が指定されていません",
        "--from-file または --line でコンテンツを指定してください",
      )
      process.exit(5)
    }

    logger.info(`"${a.title}" を作成中...`)

    const writer = await buildWriter(a)
    const result = await createPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.new", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を作成しました`)
  },
})
