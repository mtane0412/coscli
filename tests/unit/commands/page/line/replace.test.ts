/**
 * page/line/replace.test.ts — `cos page line replace <title>` コマンドのテスト。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs"
import { pageLineReplaceCommand } from "@/commands/page/line/replace"
import * as pages from "@/core/pages"

const capturedReplaceCalls: { start: number; end: number; lines: string[] }[] = []
const realReadFileSync = fs.readFileSync.bind(fs)

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let readFileSyncSpy: ReturnType<typeof spyOn>
let replacePageSpy: ReturnType<typeof spyOn>

async function runReplace(args: Record<string, unknown>) {
  await (
    pageLineReplaceCommand.run as (ctx: {
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
  capturedReplaceCalls.splice(0)
  readFileSyncSpy = spyOn(fs, "readFileSync").mockImplementation(((
    pathOrFd: number | string,
    encoding: string,
  ) => {
    if (pathOrFd === 0) return "stdin行1\nstdin行2\n"
    return realReadFileSync(
      pathOrFd as Parameters<typeof fs.readFileSync>[0],
      encoding as BufferEncoding,
    )
  }) as typeof fs.readFileSync)
  replacePageSpy = spyOn(pages, "replaceLinesInPage").mockImplementation(async (_writer, opts) => {
    capturedReplaceCalls.push({ start: opts.start, end: opts.end, lines: opts.lines })
    return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
  })
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  readFileSyncSpy.mockRestore()
  replacePageSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageLineReplaceCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runReplace({ title: "テストページ", line: "5", text: "置換行" })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line と --range 両方未指定の場合は exit 5 で終了する", async () => {
    try {
      await runReplace({ title: "テストページ", text: "置換行", project: "プロジェクト" })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line と --range 両方指定の場合は exit 5 で終了する", async () => {
    try {
      await runReplace({
        title: "テストページ",
        line: "5",
        range: "3:7",
        text: "置換行",
        project: "プロジェクト",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--text と --from-file 両方未指定の場合は exit 5 で終了する", async () => {
    try {
      await runReplace({ title: "テストページ", line: "5", project: "プロジェクト" })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--text と --from-file 両方指定の場合は exit 5 で終了する", async () => {
    try {
      await runReplace({
        title: "テストページ",
        line: "5",
        text: "置換行",
        "from-file": "test.txt",
        project: "プロジェクト",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("不正な --range (abc) の場合は exit 5 で終了する", async () => {
    try {
      await runReplace({
        title: "テストページ",
        range: "abc",
        text: "置換行",
        project: "プロジェクト",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line 5 --text '新しい行' で replaceLinesInPage を start=5,end=5 で呼ぶ", async () => {
    await runReplace({
      title: "テストページ",
      line: "5",
      text: "新しい行",
      project: "プロジェクト",
      "dry-run": false,
      json: false,
    })
    expect(replacePageSpy).toHaveBeenCalledTimes(1)
    expect(capturedReplaceCalls[0]).toMatchObject({ start: 5, end: 5, lines: ["新しい行"] })
  })

  it("--range 3:5 --text 'A\\nB' で replaceLinesInPage を start=3,end=5,lines=['A','B'] で呼ぶ", async () => {
    await runReplace({
      title: "テストページ",
      range: "3:5",
      text: "A\\nB",
      project: "プロジェクト",
      "dry-run": false,
      json: false,
    })
    expect(capturedReplaceCalls[0]).toMatchObject({ start: 3, end: 5, lines: ["A", "B"] })
  })

  it("--from-file - で stdin から行を読み込む", async () => {
    await runReplace({
      title: "テストページ",
      line: "3",
      "from-file": "-",
      project: "プロジェクト",
      "dry-run": false,
      json: false,
    })
    expect(capturedReplaceCalls[0]?.lines).toEqual(["stdin行1", "stdin行2"])
  })
})
