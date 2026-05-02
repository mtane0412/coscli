/**
 * page/insert.ts — `cos page insert <title> --after <n>` コマンド。
 *
 * 指定行 (1-indexed) の後ろに行を挿入する。
 * --line で直接テキスト指定、- で stdin から読み込む。
 * --after 0 以下または lines 数超の値は VALIDATION_ERROR (exit 5) で終了する。
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
import { insertIntoPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageInsertCommand = defineCommand({
  meta: { description: "指定行 (1-indexed) の後ろに行を挿入する" },
  args: {
    ...commonArgs,
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
    const a = args as CommonArgs & {
      title: string
      after: string
      line?: string
      "from-file"?: string
    }
    checkSandbox("page.insert", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --after バリデーション (1-indexed、1以上の整数のみ許可)
    const afterN = Number.parseInt(a.after, 10)
    if (Number.isNaN(afterN) || afterN < 1) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--after の値が無効です: "${a.after}"`,
        "1 以上の整数を指定してください (タイトル行=1)",
      )
      process.exit(5)
    }

    let lines: string[] = []
    if (a.line) {
      lines = a.line.split("\\n")
    } else if (a["from-file"] === "-") {
      const content = readFileSync(0, "utf-8")
      lines = content.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)
    } else if (a["from-file"]) {
      const content = readFileSync(a["from-file"], "utf-8")
      lines = content.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)
    }

    if (lines.length === 0) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "挿入する行が指定されていません",
        "--line または --from-file でコンテンツを指定してください",
      )
      process.exit(5)
    }

    logger.info(`"${a.title}" の ${afterN} 行目の後ろに挿入中...`)

    const writer = await buildWriter(a)
    let result: Awaited<ReturnType<typeof insertIntoPage>> | undefined
    try {
      result = await insertIntoPage(writer, { project, title: a.title, after: afterN, lines })
    } catch (err) {
      // insertIntoPage 内部の範囲外エラーをキャッチして VALIDATION_ERROR として報告
      const message = err instanceof Error ? err.message : String(err)
      writeErrorJson("VALIDATION_ERROR", message)
      process.exit(5)
      return
    }

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.insert", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" の ${afterN} 行目の後ろに挿入しました`)
  },
})
