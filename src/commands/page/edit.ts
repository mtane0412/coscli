/**
 * page/edit.ts — `cos page edit <title>` コマンド。
 *
 * ページの内容を全置換する。
 * --from-file でファイルから、- で stdin から新しい本文を読み込む。
 * --input-format=md を指定すると Markdown ファイルを Scrapbox 記法に変換して書き込む。
 * --dry-run で変更内容のプレビューのみ表示する。
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
  isStdinPath,
  notationFindingToWarning,
  requireProject,
  strictNotationArg,
  unsafeReadArg,
} from "@/commands/_shared"
import { convert } from "@/core/format/index"
import { lintNotation } from "@/core/notation/lint"
import { editPage } from "@/core/pages"
import { UnsafePathError, readFromFile, readStdinBounded } from "@/infra/safe-read"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

const VALID_INPUT_FORMATS = ["txt", "md"] as const

export const pageEditCommand = defineCommand({
  meta: { name: "edit", description: "ページ内容を全置換する" },
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
    const a = args as WriteCommonArgs &
      StrictNotationArg & {
        title: string
        "from-file": string
        "input-format": string
        "allow-unsafe-read": boolean
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
      return
    }

    let content: string
    if (isStdinPath(a["from-file"])) {
      try {
        // stdin から読み込む (citty が "-" を "" に変換するバグにも対応)
        content = readStdinBounded()
      } catch (err) {
        if (err instanceof UnsafePathError) {
          // stdin には --allow-unsafe-read は適用されないためヒントを表示しない
          writeErrorJson("UNSAFE_PATH", err.message)
          process.exit(5)
          return
        }
        throw err
      }
    } else {
      try {
        content = readFromFile(a["from-file"], { allowUnsafe: a["allow-unsafe-read"] })
      } catch (err) {
        if (err instanceof UnsafePathError) {
          writeErrorJson("UNSAFE_PATH", err.message, "--allow-unsafe-read フラグで許可できます")
          process.exit(5)
          return
        }
        throw err
      }
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
      return
    }

    // Cosense 記法の lint 検査: findings を warnings に変換する
    const findings = lintNotation(lines)
    const warnings = findings.map(notationFindingToWarning)

    if (a["strict-notation"] && findings.length > 0) {
      writeErrorJson(
        "NOTATION_LINT",
        `Cosense 記法の問題が ${findings.length} 件あります`,
        "--strict-notation を外すと警告のみで実行できます",
        { findings },
      )
      process.exit(5)
      return
    }

    logger.info(`"${a.title}" を編集中...`)

    const writer = await buildWriter(a)
    const result = await editPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.edit", startTime, warnings }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を更新しました`)
  },
})
