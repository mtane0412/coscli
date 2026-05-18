/**
 * page/prepend.test.ts — `cos page prepend <title>` コマンドのテスト。
 *
 * --from-file での stdin 読み込み (- と "" の両対応) を含む。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs"
import { pagePrependCommand } from "@/commands/page/prepend"
import * as pages from "@/core/pages"

/** prependToPage に渡された引数をキャプチャする */
const capturedPrependCalls: { lines: string[] }[] = []

// spyOn 前に実実装を保存する（モックが積み重なっても実ファイルアクセスができるように）
const realReadFileSync = fs.readFileSync.bind(fs)

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let readFileSyncSpy: ReturnType<typeof spyOn>
let prependToPageSpy: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runPrepend(args: Record<string, unknown>) {
  await (
    pagePrependCommand.run as (ctx: {
      args: unknown
      cmd: never
      rawArgs: string[]
    }) => Promise<void>
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
  capturedPrependCalls.splice(0)
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
  prependToPageSpy = spyOn(pages, "prependToPage").mockImplementation(async (_writer, opts) => {
    capturedPrependCalls.push({ lines: opts.lines })
    return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
  })
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  readFileSyncSpy.mockRestore()
  prependToPageSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pagePrependCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runPrepend({
        title: "テストページ",
        line: "追加行",
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--line も --from-file も指定しない場合は CONTENT_REQUIRED で exit 5", async () => {
    try {
      await runPrepend({
        title: "テストページ",
        project: "テストプロジェクト",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("CONTENT_REQUIRED"))
  })

  it("--line に実改行を含む文字列を渡すと prependToPage に2行で渡される", async () => {
    // $'先頭行A\n先頭行B' のようなシェル実改行を含む文字列を渡した場合の検証
    await runPrepend({
      title: "テストページ",
      line: "先頭行A\n先頭行B",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // 実改行（\n）が展開され、lines が ["先頭行A", "先頭行B"] の2行になること
    expect(capturedPrependCalls).toHaveLength(1)
    expect(capturedPrependCalls[0]?.lines).toEqual(["先頭行A", "先頭行B"])
  })

  it("--from-file '-' (明示的なstdin指定) でstdinからコンテンツを読み込む", async () => {
    // citty が正しく "-" を渡したケース
    await runPrepend({
      title: "テストページ",
      "from-file": "-",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    expect(capturedPrependCalls).toHaveLength(1)
    expect(capturedPrependCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedPrependCalls[0]?.lines).toContain("stdinの行2")
  })

  it("--from-file '' (citty のパースバグで空文字になったケース) でstdinからコンテンツを読み込む", async () => {
    // citty が --from-file - を "" に変換するバグへの対応
    await runPrepend({
      title: "テストページ",
      "from-file": "",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // "" もstdinとして扱われ、CONTENT_REQUIRED にならずコンテンツが渡されること
    expect(exitMock).not.toHaveBeenCalledWith(5)
    expect(capturedPrependCalls).toHaveLength(1)
    expect(capturedPrependCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedPrependCalls[0]?.lines).toContain("stdinの行2")
  })
})
