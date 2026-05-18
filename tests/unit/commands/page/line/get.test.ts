/**
 * page/line/get.test.ts — `cos page line get <title>` コマンドのテスト。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageLineGetCommand } from "@/commands/page/line/get"
import * as pageLine from "@/core/page-line"

const capturedGetCalls: { start: number; end: number }[] = []

/** getLineRange が返すサンプル行データ */
const sampleLines = [
  { id: "l1", text: "本文1行目", userId: "u1", created: 0, updated: 0 },
  { id: "l2", text: "本文2行目", userId: "u1", created: 0, updated: 0 },
  { id: "l3", text: "本文3行目", userId: "u1", created: 0, updated: 0 },
]

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let getLineRangeSpy: ReturnType<typeof spyOn>

/** stdout への書き込み内容を蓄積する */
let stdoutOutput: string

async function runGet(args: Record<string, unknown>) {
  await (
    pageLineGetCommand.run as (ctx: {
      args: unknown
      cmd: never
      rawArgs: string[]
    }) => Promise<void>
  )({ args, cmd: {} as never, rawArgs: [] })
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutOutput = ""
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdoutOutput += typeof chunk === "string" ? chunk : chunk.toString()
    return true
  })
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"
  capturedGetCalls.splice(0)
  getLineRangeSpy = spyOn(pageLine, "getLineRange").mockImplementation(async (_client, opts) => {
    capturedGetCalls.push({ start: opts.start, end: opts.end })
    const count = opts.end - opts.start + 1
    return { start: opts.start, end: opts.end, lines: sampleLines.slice(0, count) }
  })
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  getLineRangeSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageLineGetCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runGet({ title: "テストページ", line: "3" })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line と --range 両方未指定の場合は exit 5 で終了する", async () => {
    try {
      await runGet({ title: "テストページ", project: "プロジェクト" })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("不正な --range (abc) の場合は exit 5 で終了する", async () => {
    try {
      await runGet({
        title: "テストページ",
        range: "abc",
        project: "プロジェクト",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line 2 で getLineRange を start=2,end=2 で呼ぶ", async () => {
    await runGet({
      title: "テストページ",
      line: "2",
      project: "プロジェクト",
      json: false,
      plain: true,
    })
    expect(getLineRangeSpy).toHaveBeenCalledTimes(1)
    expect(capturedGetCalls[0]).toMatchObject({ start: 2, end: 2 })
  })

  it("--range 2:3 で getLineRange を start=2,end=3 で呼ぶ", async () => {
    await runGet({
      title: "テストページ",
      range: "2:3",
      project: "プロジェクト",
      json: false,
      plain: true,
    })
    expect(capturedGetCalls[0]).toMatchObject({ start: 2, end: 3 })
  })

  it("plain モードで各行の text を改行区切りで出力する", async () => {
    await runGet({
      title: "テストページ",
      line: "2",
      project: "プロジェクト",
      json: false,
      plain: true,
    })
    expect(stdoutOutput).toContain("本文1行目")
  })
})
