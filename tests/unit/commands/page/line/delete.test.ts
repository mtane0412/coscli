/**
 * page/line/delete.test.ts — `cos page line delete <title>` コマンドのテスト。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageLineDeleteCommand } from "@/commands/page/line/delete"
import * as pages from "@/core/pages"

const capturedDeleteCalls: { start: number; end: number }[] = []

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let deletePageSpy: ReturnType<typeof spyOn>

async function runDelete(args: Record<string, unknown>) {
  await (
    pageLineDeleteCommand.run as (ctx: {
      args: unknown
      cmd: never
      rawArgs: string[]
    }) => Promise<void>
  )({ args, cmd: {} as never, rawArgs: [] })
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"
  capturedDeleteCalls.splice(0)
  deletePageSpy = spyOn(pages, "deleteLinesFromPage").mockImplementation(async (_writer, opts) => {
    capturedDeleteCalls.push({ start: opts.start, end: opts.end })
    return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
  })
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  deletePageSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageLineDeleteCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runDelete({ title: "テストページ", line: "5" })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line と --range 両方未指定の場合は exit 5 で終了する", async () => {
    try {
      await runDelete({ title: "テストページ", project: "プロジェクト" })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line と --range 両方指定の場合は exit 5 で終了する", async () => {
    try {
      await runDelete({
        title: "テストページ",
        line: "5",
        range: "3:7",
        project: "プロジェクト",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("不正な --range (abc) の場合は exit 5 で終了する", async () => {
    try {
      await runDelete({
        title: "テストページ",
        range: "abc",
        project: "プロジェクト",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line 5 で deleteLinesFromPage を start=5,end=5 で呼ぶ", async () => {
    await runDelete({
      title: "テストページ",
      line: "5",
      project: "プロジェクト",
      "dry-run": false,
      json: false,
    })
    expect(deletePageSpy).toHaveBeenCalledTimes(1)
    expect(capturedDeleteCalls[0]).toMatchObject({ start: 5, end: 5 })
  })

  it("--range 3:5 で deleteLinesFromPage を start=3,end=5 で呼ぶ", async () => {
    await runDelete({
      title: "テストページ",
      range: "3:5",
      project: "プロジェクト",
      "dry-run": false,
      json: false,
    })
    expect(capturedDeleteCalls[0]).toMatchObject({ start: 3, end: 5 })
  })
})
