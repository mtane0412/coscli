/**
 * page/line/delete.ts — `cos page line delete <title>` コマンド。
 *
 * 指定行 (--line n) または範囲 (--range a:b) を削除する。
 * タイトル行 (1行目) は削除不可。範囲外は VALIDATION_ERROR (exit 5) で終了する。
 */

import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  requireProject,
} from "@/commands/_shared"
import { deleteLinesFromPage } from "@/core/pages"
import { RangeSpecError, parseLineSpec } from "@/core/range"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageLineDeleteCommand = defineCommand({
  meta: { name: "delete", description: "指定行または範囲を削除する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    line: {
      type: "string",
      description: "削除する行番号 (1-indexed、タイトル行=1)",
    },
    range: {
      type: "string",
      description: "削除する行範囲 (例: 3:7)",
    },
    "expect-commit": {
      type: "string",
      description: "期待する commitId (楽観ロック用)",
    },
    force: {
      type: "boolean",
      description: "楽観ロックを無効化して強制上書きする",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs & {
      title: string
      line?: string
      range?: string
      "expect-commit"?: string
      force: boolean
    }
    checkSandbox("page.line.delete", a)
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

    logger.info(`"${a.title}" の ${start}〜${end} 行目を削除中...`)

    const writer = await buildWriter(a)
    let result: Awaited<ReturnType<typeof deleteLinesFromPage>> | undefined
    try {
      result = await deleteLinesFromPage(writer, {
        project,
        title: a.title,
        start,
        end,
      })
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.startsWith("--range/--line の値が範囲外です") ||
          err.message.startsWith("タイトル行は編集できません"))
      ) {
        writeErrorJson("VALIDATION_ERROR", err.message)
        process.exit(5)
        return
      }
      throw err
    }

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.line.delete", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" の ${start}〜${end} 行目を削除しました`)
  },
})
