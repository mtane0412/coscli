/**
 * convert.ts — `cos convert --from=<fmt> --to=<fmt>` コマンド。
 *
 * Scrapbox 記法と Markdown を相互変換する。
 * --from-file でファイルから、未指定の場合は stdin から入力を読む。
 * --to-file でファイルへ、未指定の場合は stdout へ出力する。
 */

import { readFileSync, writeFileSync } from "node:fs"
import { type CommonArgs, checkSandbox, commonArgs } from "@/commands/_shared"
import { type BoldStyle, type FormatKind, convert } from "@/core/format/index"
import { writeErrorJson } from "@/presenter/json"
import { defineCommand } from "citty"

const VALID_FORMATS = ["scrapbox", "md"] as const
const VALID_BOLD_STYLES = ["auto", "heading", "emphasis"] as const

export const convertCommand = defineCommand({
  meta: { name: "convert", description: "Scrapbox 記法と Markdown を相互変換する" },
  args: {
    ...commonArgs,
    from: {
      type: "string",
      description: "入力フォーマット (scrapbox | md)",
      required: true,
    },
    to: {
      type: "string",
      description: "出力フォーマット (scrapbox | md)",
      required: true,
    },
    "from-file": {
      type: "string",
      description: "入力ファイルパス (- または未指定で stdin)",
    },
    "to-file": {
      type: "string",
      description: "出力ファイルパス (未指定で stdout)",
    },
    "bold-style": {
      type: "string",
      description:
        "Scrapbox→MD 変換時の太字記法解釈 (auto | heading | emphasis)。--from=scrapbox --to=md のときのみ有効",
      default: "auto",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      from: string
      to: string
      "from-file"?: string
      "to-file"?: string
      "bold-style": string
    }
    checkSandbox("convert", a)

    // --from / --to バリデーション
    if (!(VALID_FORMATS as readonly string[]).includes(a.from)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--from=${a.from} は無効な値です`,
        `有効な値: ${VALID_FORMATS.join(", ")}`,
      )
      process.exit(5)
    }
    if (!(VALID_FORMATS as readonly string[]).includes(a.to)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--to=${a.to} は無効な値です`,
        `有効な値: ${VALID_FORMATS.join(", ")}`,
      )
      process.exit(5)
    }

    // 同一フォーマットエラー
    if (a.from === a.to) {
      writeErrorJson(
        "SAME_FORMAT_ERROR",
        `--from と --to が同じフォーマット (${a.from}) です`,
        "異なるフォーマットを指定してください",
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

    // 入力読み込み
    let input: string
    const fromFile = a["from-file"]
    if (!fromFile || fromFile === "-") {
      input = readFileSync(0, "utf-8")
    } else {
      input = readFileSync(fromFile, "utf-8")
    }

    // 変換実行
    const output = convert(input, a.from as FormatKind, a.to as FormatKind, {
      boldStyle: a["bold-style"] as BoldStyle,
    })

    // 出力
    const toFile = a["to-file"]
    if (toFile) {
      writeFileSync(toFile, output, "utf-8")
    } else {
      process.stdout.write(`${output}\n`)
    }
  },
})
