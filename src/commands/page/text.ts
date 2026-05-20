/**
 * page/text.ts — `cos page text <title>` コマンド。
 *
 * ページのプレーンテキスト本文を取得して stdout に出力する。
 * --format=md を指定すると Scrapbox 記法を Markdown に変換して出力する。
 * --format=scrapbox は --format=txt の alias として扱う。
 * --body-only を指定するとタイトル行を除いた本文のみを出力する。
 * パイプや他ツールとの連携に使う。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  requireProject,
} from "@/commands/_shared"
import { type BoldStyle, convert } from "@/core/format/index"
import { getPageText } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

const VALID_FORMATS = ["txt", "md"] as const

/** scrapbox は txt の alias として受け付けるフォーマット値の対応表 */
const FORMAT_ALIASES: Record<string, (typeof VALID_FORMATS)[number]> = {
  scrapbox: "txt",
}

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
      description: "出力フォーマット (txt | md | scrapbox)。scrapbox は txt の alias",
      default: "txt",
    },
    "bold-style": {
      type: "string",
      description:
        "Scrapbox→MD 変換時の太字記法解釈 (auto | heading | emphasis)。--format=md のときのみ有効",
      default: "auto",
    },
    "body-only": {
      type: "boolean",
      description: "タイトル行を除いた本文のみを出力する。cos page edit へのパイプ入力に使う",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title: string
      format: string
      "bold-style": string
      "body-only": boolean
    }
    checkSandbox("page.text", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // alias を正規値に変換する (例: scrapbox → txt)
    const resolvedFormat = FORMAT_ALIASES[a.format] ?? a.format

    // --format バリデーション
    if (!(VALID_FORMATS as readonly string[]).includes(resolvedFormat)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--format=${a.format} は無効な値です`,
        `有効な値: ${VALID_FORMATS.join(", ")}, scrapbox (txt の alias)`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    // --bold-style バリデーション
    if (!(VALID_BOLD_STYLES as readonly string[]).includes(a["bold-style"])) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--bold-style=${a["bold-style"]} は無効な値です`,
        `有効な値: ${VALID_BOLD_STYLES.join(", ")}`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    const client = await buildRestClient(a)
    const rawText = await getPageText(client, { project, title: a.title })

    let outputText: string
    if (resolvedFormat === "md") {
      const converted = convert(rawText, "scrapbox", "md", {
        boldStyle: a["bold-style"] as BoldStyle,
      })
      // --body-only 指定時は MD 変換後に先頭の # タイトル行と直後の空行を除く
      // (Scrapbox パーサーが lines[0] をタイトルとして扱うため変換前に除去すると見出しレベルがずれる;
      //  変換後は "# title\n\n## ..." の形式になるため slice(1) だけでは先頭が空行になる)
      outputText = a["body-only"]
        ? converted.split("\n").slice(1).join("\n").replace(/^\n+/, "")
        : converted
    } else {
      // txt の場合はタイトル行が Scrapbox 記法に依存しないため変換前に除去できる
      outputText = a["body-only"] ? rawText.split("\n").slice(1).join("\n") : rawText
    }

    if (a.json) {
      writeJson({ text: outputText }, { command: "page.text", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${outputText}\n`)
  },
})
