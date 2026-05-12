/**
 * page/prepend.ts — `cos page prepend <title>` コマンド。
 *
 * ページのタイトル行直後に行を挿入する。
 * --line で直接テキスト指定、- で stdin から読み込む。
 */

import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  isStdinPath,
  requireProject,
  unsafeReadArg,
} from "@/commands/_shared"
import { prependToPage } from "@/core/pages"
import { UnsafePathError, readFromFile, readStdinBounded } from "@/infra/safe-read"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pagePrependCommand = defineCommand({
  meta: { name: "prepend", description: "ページ先頭 (タイトル直後) に行を挿入する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
    ...unsafeReadArg,
    title: {
      type: "positional",
      description: "ページタイトル",
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
      line?: string
      "from-file"?: string
      "allow-unsafe-read": boolean
    }
    checkSandbox("page.prepend", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    let lines: string[] = []
    if (a.line !== undefined) {
      lines = a.line.split(/\r?\n|\\n/)
    } else if (a["from-file"] !== undefined) {
      try {
        // citty が "-" を "" に変換するバグにも対応するため isStdinPath で判定する
        const content = isStdinPath(a["from-file"])
          ? readStdinBounded()
          : readFromFile(a["from-file"], { allowUnsafe: a["allow-unsafe-read"] })
        lines = content.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1)
      } catch (err) {
        if (err instanceof UnsafePathError) {
          writeErrorJson("UNSAFE_PATH", err.message, "--allow-unsafe-read フラグで許可できます")
          process.exit(5)
          return
        }
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

    logger.info(`"${a.title}" の先頭に行を挿入中...`)

    const writer = await buildWriter(a)
    const result = await prependToPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.prepend", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" の先頭に挿入しました`)
  },
})
