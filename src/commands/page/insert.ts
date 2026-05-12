/**
 * page/insert.ts — `cos page insert <title> --after <n>` コマンド。
 *
 * 指定行 (1-indexed) の後ろに行を挿入する。
 * --line で直接テキスト指定、- で stdin から読み込む。
 * --after 0 以下または lines 数超の値は VALIDATION_ERROR (exit 5) で終了する。
 */

import { readFileSync } from "node:fs"
import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  getRawFlagValue,
  isStdinPath,
  requireProject,
} from "@/commands/_shared"
import { insertIntoPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageInsertCommand = defineCommand({
  meta: { name: "insert", description: "指定行 (1-indexed) の後ろに行を挿入する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
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
    const a = args as WriteCommonArgs & {
      title: string
      after: string
      line?: string
      "from-file"?: string
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
      process.exit(5)
      return
    }
    const afterN = Number.parseInt(rawAfter, 10)

    let lines: string[] = []
    if (a.line !== undefined) {
      lines = a.line.split(/\r?\n|\\n/)
    } else if (a["from-file"] !== undefined) {
      try {
        // citty が "-" を "" に変換するバグにも対応するため isStdinPath で判定する
        const content = isStdinPath(a["from-file"])
          ? readFileSync(0, "utf-8")
          : readFileSync(a["from-file"], "utf-8")
        lines = content.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)
      } catch {
        writeErrorJson(
          "VALIDATION_ERROR",
          `ファイルの読み込みに失敗しました: "${a["from-file"]}"`,
          "ファイルパスが正しいか確認してください",
        )
        process.exit(5)
        return
      }
    }

    if (lines.length === 0) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "挿入する行が指定されていません",
        "--line または --from-file でコンテンツを指定してください",
      )
      process.exit(5)
      return
    }

    logger.info(`"${a.title}" の ${afterN} 行目の後ろに挿入中...`)

    const writer = await buildWriter(a)
    let result: Awaited<ReturnType<typeof insertIntoPage>> | undefined
    try {
      result = await insertIntoPage(writer, { project, title: a.title, after: afterN, lines })
    } catch (err) {
      // insertIntoPage 内部の範囲外エラーのみ VALIDATION_ERROR として報告し、それ以外は再スロー
      if (err instanceof Error && err.message.startsWith("--after の値が範囲外です")) {
        writeErrorJson("VALIDATION_ERROR", err.message)
        process.exit(5)
        return
      }
      throw err
    }

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.insert", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" の ${afterN} 行目の後ろに挿入しました`)
  },
})
