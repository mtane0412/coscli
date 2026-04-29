/**
 * page/edit.ts — `cos page edit <title>` コマンド。
 *
 * ページの内容を全置換する。
 * --from-file でファイルから、- で stdin から新しい本文を読み込む。
 * --dry-run で変更内容のプレビューのみ表示する。
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
import { editPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageEditCommand = defineCommand({
  meta: { description: "ページ内容を全置換する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    "from-file": {
      type: "string",
      description: "新しい本文ファイルパス (- で stdin)",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; "from-file": string }
    checkSandbox("page.edit", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    let content: string
    if (a["from-file"] === "-") {
      content = readFileSync(0, "utf-8")
    } else {
      content = readFileSync(a["from-file"], "utf-8")
    }
    const lines = content.split("\n").filter((_, i, arr) => i < arr.length - 1 || arr[i] !== "")

    if (lines.length === 0) {
      writeErrorJson("CONTENT_REQUIRED", "新しい本文が空です")
      process.exit(5)
    }

    logger.info(`"${a.title}" を編集中...`)

    const writer = await buildWriter(a)
    const result = await editPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.edit", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を更新しました`)
  },
})
