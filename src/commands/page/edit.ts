/**
 * page/edit.ts — `cos page edit <title>` コマンド。
 *
 * ページの内容を全置換する。
 * --from-file でファイルから、- で stdin から新しい本文を読み込む。
 * --input-format=md を指定すると Markdown ファイルを Scrapbox 記法に変換して書き込む。
 * --dry-run で変更内容のプレビューのみ表示する。
 *
 * デフォルトで楽観ロックが有効。編集中に他者がページを更新した場合は exit 6 で停止する。
 * --force で従来の上書き挙動に戻す。--expect-commit で期待 commitId を明示指定できる。
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
  exitWithError,
  isStdinPath,
  requireProject,
  runNotationLint,
  strictNotationArg,
  unsafeReadArg,
} from "@/commands/_shared"
import { CommitConflictError } from "@/core/errors"
import { convert } from "@/core/format/index"
import { normalizeCodeBlockEmptyLines } from "@/core/notation/normalize"
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
    force: {
      type: "boolean",
      description: "楽観ロックを無効化して上書きする (競合時も続行)",
      default: false,
    },
    "expect-commit": {
      type: "string",
      description: "期待する commitId (不一致なら exit 6 で停止)",
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs &
      StrictNotationArg & {
        title: string
        "from-file": string
        "input-format": string
        "allow-unsafe-read": boolean
        force: boolean
        "expect-commit"?: string
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
      exitWithError(5, "VALIDATION_ERROR")
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
          exitWithError(5, "UNSAFE_PATH")
        }
        throw err
      }
    } else {
      try {
        content = readFromFile(a["from-file"], { allowUnsafe: a["allow-unsafe-read"] })
      } catch (err) {
        if (err instanceof UnsafePathError) {
          writeErrorJson("UNSAFE_PATH", err.message, "--allow-unsafe-read フラグで許可できます")
          exitWithError(5, "UNSAFE_PATH")
        }
        throw err
      }
    }

    // MD フォーマットの場合は Scrapbox 記法に変換する
    const normalizedContent =
      a["input-format"] === "md" ? convert(content, "md", "scrapbox") : content

    const lines = normalizeCodeBlockEmptyLines(
      normalizedContent.split("\n").filter((_, i, arr) => i < arr.length - 1 || arr[i] !== ""),
    )

    if (lines.length === 0) {
      writeErrorJson("CONTENT_REQUIRED", "新しい本文が空です")
      exitWithError(5, "CONTENT_REQUIRED")
    }

    const warnings = runNotationLint(lines, a)

    const writer = await buildWriter(a)
    let result: Awaited<ReturnType<typeof editPage>>
    try {
      result = await editPage(writer, {
        project,
        title: a.title,
        lines,
        force: a.force,
        ...(a["expect-commit"] !== undefined && { expectCommitId: a["expect-commit"] }),
      })
    } catch (err) {
      if (err instanceof CommitConflictError) {
        writeErrorJson("CONFLICT", err.message)
        exitWithError(6, "CONFLICT")
      }
      throw err
    }

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.edit", startTime, warnings }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を更新しました`)
  },
})
