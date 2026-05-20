/**
 * page/insert.ts — `cos page insert <title> --after <n>` コマンド。
 *
 * 指定行 (1-indexed) の後ろに行を挿入する。
 * --line で直接テキスト指定、- で stdin から読み込む。
 * --after 0 以下または lines 数超の値は VALIDATION_ERROR (exit 5) で終了する。
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
  getRawFlagValue,
  readWriteInput,
  requireProject,
  runNotationLint,
  strictNotationArg,
  unsafeReadArg,
} from "@/commands/_shared"
import { insertIntoPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageInsertCommand = defineCommand({
  meta: { name: "insert", description: "指定行 (1-indexed) の後ろに行を挿入する" },
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
    after: {
      type: "string",
      description: "挿入位置 (1-indexed の行番号、タイトル行=1)",
      required: true,
    },
    line: {
      type: "string",
      description: "挿入する行テキスト (複数行は \\n で区切る)",
    },
    "from-file": {
      type: "string",
      description: "挿入行のファイルパス (- で stdin)",
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs &
      StrictNotationArg & {
        title: string
        after: string
        line?: string
        "from-file"?: string
        "allow-unsafe-read": boolean
      }
    checkSandbox("page.insert", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --after バリデーション (1-indexed、正の整数のみ許可。"1abc" や "1.5" は弾く)
    // citty が負数引数をフラグとして解析し a.after が "" になるバグに対応するため、
    // process.argv から実値を取得してエラーメッセージに表示する
    const rawAfter = a.after !== "" ? a.after : (getRawFlagValue(process.argv, "after") ?? "")
    if (!/^[1-9]\d*$/.test(rawAfter)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--after の値が無効です: "${rawAfter}"`,
        "1 以上の整数を指定してください (タイトル行=1)",
      )
      exitWithError(5, "VALIDATION_ERROR")
    }
    const afterN = Number.parseInt(rawAfter, 10)

    const lines = readWriteInput(a, {
      requireContentErrorCode: "CONTENT_REQUIRED",
      requireContentMessage: "挿入する行が指定されていません",
      requireContentHint: "--line または --from-file でコンテンツを指定してください",
    })
    const warnings = runNotationLint(lines, a)

    const writer = await buildWriter(a)
    let result: Awaited<ReturnType<typeof insertIntoPage>> | undefined
    try {
      result = await insertIntoPage(writer, { project, title: a.title, after: afterN, lines })
    } catch (err) {
      // insertIntoPage 内部の範囲外エラーのみ VALIDATION_ERROR として報告し、それ以外は再スロー
      if (err instanceof Error && err.message.startsWith("--after の値が範囲外です")) {
        writeErrorJson("VALIDATION_ERROR", err.message)
        exitWithError(5, "VALIDATION_ERROR")
      }
      throw err
    }

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.insert", startTime, warnings }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" の ${afterN} 行目の後ろに挿入しました`)
  },
})
