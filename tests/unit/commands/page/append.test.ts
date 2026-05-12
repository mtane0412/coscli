/**
 * page/append.test.ts — `cos page append <title>` コマンドのテスト。
 *
 * 基本的な append 動作と --line の実改行展開を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { pageAppendCommand } from "@/commands/page/append"

/** appendToPage に渡された引数をキャプチャする */
const capturedAppendCalls: { lines: string[] }[] = []

// Bun は mock.module をファイル先頭にホイストするため import より前に評価される
mock.module("@/core/pages", () => ({
  appendToPage: mock(
    async (_writer: unknown, opts: { project: string; title: string; lines: string[] }) => {
      capturedAppendCalls.push({ lines: opts.lines })
      return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
    },
  ),
}))

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runAppend(args: Record<string, unknown>) {
  await (
    pageAppendCommand.run as (ctx: {
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
  // requireSid のキーチェーン呼び出しをスキップするためダミー SID を設定する
  process.env["COS_SID"] = "ダミーセッションID-テスト用"
  // 各テスト前にキャプチャを初期化する
  capturedAppendCalls.length = 0
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageAppendCommand", () => {
  it("--line で指定した文字列が appendToPage に1行で渡される", async () => {
    // 基本的な append 動作: 1行テキストを渡すと appendToPage に1行で渡されること
    await runAppend({
      title: "テストページ",
      line: "追記行テキスト",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    expect(capturedAppendCalls).toHaveLength(1)
    expect(capturedAppendCalls[0]?.lines).toEqual(["追記行テキスト"])
  })

  it("--line に実改行を含む文字列を渡すと appendToPage に2行で渡される", async () => {
    // $'追記行A\n追記行B' のようなシェル実改行を含む文字列を渡した場合の検証
    await runAppend({
      title: "テストページ",
      line: "追記行A\n追記行B",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // 実改行（\n）が展開され、lines が ["追記行A", "追記行B"] の2行になること
    expect(capturedAppendCalls).toHaveLength(1)
    expect(capturedAppendCalls[0]?.lines).toEqual(["追記行A", "追記行B"])
  })

  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runAppend({
        title: "テストページ",
        line: "追記行テキスト",
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
      await runAppend({
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
})
