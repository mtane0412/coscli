/**
 * page/text.ts — `cos page text <title>` コマンド。
 *
 * ページのプレーンテキスト本文を取得して stdout に出力する。
 * --format=md を指定すると Scrapbox 記法を Markdown に変換して出力する。
 * パイプや他ツールとの連携に使う。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { type BoldStyle, convert } from "@/core/format/index"
import { getPageText } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

const VALID_FORMATS = ["txt", "md"] as const
const VALID_BOLD_STYLES = ["auto", "heading", "emphasis"] as const

export const pageTextCommand = defineCommand({
  meta: { name: "text", description: "ページのテキスト本文を取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    format: {
      type: "string",
      description: "出力フォーマット (txt | md)",
      default: "txt",
    },
    "bold-style": {
      type: "string",
      description:
        "Scrapbox→MD 変換時の太字記法解釈 (auto | heading | emphasis)。--format=md のときのみ有効",
      default: "auto",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; format: string; "bold-style": string }
    checkSandbox("page.text", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --format バリデーション
    if (!(VALID_FORMATS as readonly string[]).includes(a.format)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--format=${a.format} は無効な値です`,
        `有効な値: ${VALID_FORMATS.join(", ")}`,
      )
      process.exit(5)
    }

    // --bold-style バリデーション
    if (!(VALID_BOLD_STYLES as readonly string[]).includes(a["bold-style"])) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--bold-style=${a["bold-style"]} は無効な値です`,
        `有効な値: ${VALID_BOLD_STYLES.join(", ")}`,
      )
      process.exit(5)
    }

    logger.info(`"${a.title}" のテキストを取得中...`)

    const client = await buildRestClient(a)
    const rawText = await getPageText(client, { project, title: a.title })

    const outputText =
      a.format === "md"
        ? convert(rawText, "scrapbox", "md", { boldStyle: a["bold-style"] as BoldStyle })
        : rawText

    if (a.json) {
      writeJson({ text: outputText }, { command: "page.text", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${outputText}\n`)
  },
})
