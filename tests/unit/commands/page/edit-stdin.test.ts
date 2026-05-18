/**
 * page/edit-stdin.test.ts — `cos page edit` コマンドの stdin 読み込みテスト。
 *
 * citty のパースバグで --from-file - が "" として渡される問題の修正を検証する。
 * node:fs をモックして stdin (fd=0) から固定コンテンツを返す。
 * 既存の edit.test.ts はファイル I/O を使うため分離している。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs"
import { pageEditCommand } from "@/commands/page/edit"
import * as pages from "@/core/pages"

/** editPage に渡された引数をキャプチャする */
const capturedEditPageCalls: { project: string; title: string; lines: string[] }[] = []

// spyOn 前に実実装を保存する（モックが積み重なっても実ファイルアクセスができるように）
const realReadFileSync = fs.readFileSync.bind(fs)

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let readFileSyncSpy: ReturnType<typeof spyOn>
let editPageSpy: ReturnType<typeof spyOn>

async function runEdit(args: Record<string, unknown>) {
  await (
    pageEditCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"
  capturedEditPageCalls.splice(0)
  // stdin (fd=0) から固定コンテンツを返す。実ファイルは realReadFileSync でパススルーする
  readFileSyncSpy = spyOn(fs, "readFileSync").mockImplementation(((
    pathOrFd: number | string,
    encoding: string,
  ) => {
    if (pathOrFd === 0) return "stdinの行1\nstdinの行2\n"
    return realReadFileSync(
      pathOrFd as Parameters<typeof fs.readFileSync>[0],
      encoding as BufferEncoding,
    )
  }) as typeof fs.readFileSync)
  editPageSpy = spyOn(pages, "editPage").mockImplementation(async (_writer, opts) => {
    capturedEditPageCalls.push({ project: opts.project, title: opts.title, lines: opts.lines })
    return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
  })
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  readFileSyncSpy.mockRestore()
  editPageSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageEditCommand stdin 読み込み", () => {
  it("--from-file '-' (明示的なstdin指定) でstdinからコンテンツを読み込む", async () => {
    // citty が正しく "-" を渡したケース
    await runEdit({
      title: "テストページ",
      "from-file": "-",
      "input-format": "txt",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // stdin からコンテンツが読み込まれ editPage に渡されること
    expect(exitMock).not.toHaveBeenCalledWith(5)
    expect(capturedEditPageCalls).toHaveLength(1)
    expect(capturedEditPageCalls[0]?.project).toBe("テストプロジェクト")
    expect(capturedEditPageCalls[0]?.title).toBe("テストページ")
    expect(capturedEditPageCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedEditPageCalls[0]?.lines).toContain("stdinの行2")
  })

  it("--from-file '' (citty のパースバグで空文字になったケース) でstdinからコンテンツを読み込む", async () => {
    // citty が --from-file - を "" に変換するバグへの対応
    await runEdit({
      title: "テストページ",
      "from-file": "",
      "input-format": "txt",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // "" もstdinとして扱われ、ENOENT にならず editPage にコンテンツが渡されること
    expect(exitMock).not.toHaveBeenCalledWith(5)
    expect(capturedEditPageCalls).toHaveLength(1)
    expect(capturedEditPageCalls[0]?.project).toBe("テストプロジェクト")
    expect(capturedEditPageCalls[0]?.title).toBe("テストページ")
    expect(capturedEditPageCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedEditPageCalls[0]?.lines).toContain("stdinの行2")
  })
})
