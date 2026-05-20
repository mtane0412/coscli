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
  exitWithError,
  readWriteInput,
  requireProject,
  runNotationLint,
  strictNotationArg,
  unsafeReadArg,
} from "@/commands/_shared"
import { PageLineError } from "@/core/errors"
import { replaceLinesInPage } from "@/core/pages"
import { RangeSpecError, parseLineSpec } from "@/core/range"
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
        exitWithError(5, "VALIDATION_ERROR")
      }
      throw err
    }

    // --text / --from-file 排他チェック
    if (a.text !== undefined && a["from-file"] !== undefined) {
      writeErrorJson("VALIDATION_ERROR", "--text と --from-file を同時に指定することはできません")
      exitWithError(5, "VALIDATION_ERROR")
    }

    // 行内容の読み込み (line は行番号のため text/from-file のみ渡す)
    const lines = readWriteInput(
      {
        ...(a.text !== undefined && { text: a.text }),
        ...(a["from-file"] !== undefined && { "from-file": a["from-file"] }),
        "allow-unsafe-read": a["allow-unsafe-read"],
      },
      {
        requireContentErrorCode: "CONTENT_REQUIRED",
        requireContentMessage: "置換内容が指定されていません",
        requireContentHint: "--text または --from-file でコンテンツを指定してください",
      },
    )
    const warnings = runNotationLint(lines, a)

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
        exitWithError(5, "VALIDATION_ERROR")
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
