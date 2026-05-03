/**
 * page/edit.ts — `cos page edit <title>` コマンド。
 *
 * ページの内容を全置換する。
 * --from-file でファイルから、- で stdin から新しい本文を読み込む。
 * --input-format=md を指定すると Markdown ファイルを Scrapbox 記法に変換して書き込む。
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
import { convert } from "@/core/format/index"
import { editPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

const VALID_INPUT_FORMATS = ["txt", "md"] as const

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
    "input-format": {
      type: "string",
      description: "入力ファイルのフォーマット (txt | md)",
      default: "txt",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title: string
      "from-file": string
      "input-format": string
    }
    checkSandbox("page.edit", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --input-format バリデーション
    if (!(VALID_INPUT_FORMATS as readonly string[]).includes(a["input-format"])) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--input-format=${a["input-format"]} は無効な値です`,
        `有効な値: ${VALID_INPUT_FORMATS.join(", ")}`,
      )
      process.exit(5)
    }

    let content: string
    if (a["from-file"] === "-") {
      content = readFileSync(0, "utf-8")
    } else {
      content = readFileSync(a["from-file"], "utf-8")
    }

    // MD フォーマットの場合は Scrapbox 記法に変換する
    const normalizedContent =
      a["input-format"] === "md" ? convert(content, "md", "scrapbox") : content

    const lines = normalizedContent
      .split("\n")
      .filter((_, i, arr) => i < arr.length - 1 || arr[i] !== "")

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
