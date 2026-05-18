/**
 * page/line/get.ts — `cos page line get <title>` コマンド。
 *
 * 指定行 (--line n) または範囲 (--range a:b) の内容を取得して出力する。
 * 書き込みは行わない読み取り専用コマンド。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { getLineRange } from "@/core/page-line"
import { RangeSpecError, parseLineSpec } from "@/core/range"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageLineGetCommand = defineCommand({
  meta: { name: "get", description: "指定行または範囲を取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    line: {
      type: "string",
      description: "取得する行番号 (1-indexed、タイトル行=1)",
    },
    range: {
      type: "string",
      description: "取得する行範囲 (例: 3:7)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title: string
      line?: string
      range?: string
    }
    checkSandbox("page.line.get", a)
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

    logger.info(`"${a.title}" の ${start}〜${end} 行目を取得中...`)

    const client = await buildRestClient(a)
    const result = await getLineRange(client, {
      project,
      title: a.title,
      start,
      end,
    })

    if (a.json || !a.plain) {
      writeJson(result, { command: "page.line.get", startTime }, buildJsonOpts(a))
      return
    }

    for (const line of result.lines) {
      process.stdout.write(`${line.text}\n`)
    }
  },
})
