/**
 * page/line/replace.ts — `cos page line replace <title>` コマンド。
 *
 * 指定行 (--line n) または範囲 (--range a:b) を新しい内容で置換する。
 * --text で直接テキスト指定、--from-file または - で stdin から読み込む。
 * タイトル行 (1行目) は置換不可。範囲外は VALIDATION_ERROR (exit 5) で終了する。
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
import { PageLineError } from "@/core/errors"
import { lintNotation } from "@/core/notation/lint"
import { replaceLinesInPage } from "@/core/pages"
import { RangeSpecError, parseLineSpec } from "@/core/range"
import { UnsafePathError, readFromFile, readStdinBounded } from "@/infra/safe-read"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageLineReplaceCommand = defineCommand({
  meta: { name: "replace", description: "指定行または範囲を置換する" },
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
    line: {
      type: "string",
      description: "置換する行番号 (1-indexed、タイトル行=1)",
    },
    range: {
      type: "string",
      description: "置換する行範囲 (例: 3:7)",
    },
    text: {
      type: "string",
      description: "置換内容 (複数行は \\n で区切る)",
    },
    "from-file": {
      type: "string",
      description: "置換内容のファイルパス (- で stdin)",
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs &
      StrictNotationArg & {
        title: string
        line?: string
        range?: string
        text?: string
        "from-file"?: string
        "allow-unsafe-read": boolean
      }
    checkSandbox("page.line.replace", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --line / --range パース
    let start: number
    let end: number
    try {
      const spec = parseLineSpec({
        ...(a.line !== undefined && { line: a.line }),
        ...(a.range !== undefined && { range: a.range }),
      })
      start = spec.start
      end = spec.end
    } catch (err) {
      if (err instanceof RangeSpecError) {
        writeErrorJson("VALIDATION_ERROR", err.message)
        process.exit(5)
        return
      }
      throw err
    }

    // --text / --from-file 排他チェック
    const hasText = a.text !== undefined
    const hasFile = a["from-file"] !== undefined

    if (hasText && hasFile) {
      writeErrorJson("VALIDATION_ERROR", "--text と --from-file を同時に指定することはできません")
      process.exit(5)
      return
    }

    if (!hasText && !hasFile) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "置換内容が指定されていません",
        "--text または --from-file でコンテンツを指定してください",
      )
      process.exit(5)
      return
    }

    // 行内容の読み込み
    let lines: string[] = []
    if (hasText) {
      lines = (a.text as string).split(/\r?\n|\\n/)
    } else {
      const filePath = a["from-file"] as string
      if (isStdinPath(filePath)) {
        try {
          const content = readStdinBounded()
          lines = content.split(/\r?\n/).filter((l, i, arr) => l !== "" || i < arr.length - 1)
        } catch (err) {
          if (err instanceof UnsafePathError) {
            writeErrorJson("UNSAFE_PATH", err.message)
            process.exit(5)
            return
          }
          throw err
        }
      } else {
        try {
          const content = readFromFile(filePath, { allowUnsafe: a["allow-unsafe-read"] })
          lines = content.split(/\r?\n/).filter((l, i, arr) => l !== "" || i < arr.length - 1)
        } catch (err) {
          if (err instanceof UnsafePathError) {
            writeErrorJson("UNSAFE_PATH", err.message, "--allow-unsafe-read フラグで許可できます")
            process.exit(5)
            return
          }
          writeErrorJson(
            "VALIDATION_ERROR",
            `ファイルの読み込みに失敗しました: "${filePath}"`,
            "ファイルパスが正しいか確認してください",
          )
          process.exit(5)
          return
        }
      }
    }

    if (lines.length === 0) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "置換内容が空です",
        "--text または --from-file でコンテンツを指定してください",
      )
      process.exit(5)
      return
    }

    // Cosense 記法の lint 検査
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

    logger.info(`"${a.title}" の ${start}〜${end} 行目を置換中...`)

    const writer = await buildWriter(a)
    let result: Awaited<ReturnType<typeof replaceLinesInPage>> | undefined
    try {
      result = await replaceLinesInPage(writer, {
        project,
        title: a.title,
        start,
        end,
        lines,
        previewLines: lines,
      })
    } catch (err) {
      if (err instanceof PageLineError) {
        writeErrorJson("VALIDATION_ERROR", err.message)
        process.exit(5)
        return
      }
      throw err
    }

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.line.replace", startTime, warnings }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" の ${start}〜${end} 行目を置換しました`)
  },
})
