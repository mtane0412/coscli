/**
 * page/append.test.ts — `cos page append <title>` コマンドのテスト。
 *
 * --line 指定、--from-file での stdin 読み込み (- と "" の両対応) を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { pageAppendCommand } from "@/commands/page/append"

/** appendToPage に渡された引数をキャプチャする */
const capturedAppendCalls: { lines: string[] }[] = []

// Bun は mock.module をファイル先頭にホイストするため import より前に評価される
// 実ファイルは "fs" モジュール ("node:fs" と別レジストリ) 経由でパススルーする
mock.module("node:fs", () => ({
  readFileSync: (pathOrFd: number | string, encoding: string) => {
    if (pathOrFd === 0) return "stdinの行1\nstdinの行2\n"
    // "fs" は "node:fs" と Bun のモックレジストリ上で別エントリのためモックの影響外
    // biome-ignore lint/style/useNodejsImportProtocol: モックバイパスに "node:" なしが必要
    return (require("fs") as typeof import("node:fs")).readFileSync(
      pathOrFd as Parameters<typeof import("node:fs").readFileSync>[0],
      encoding as BufferEncoding,
    )
  },
}))

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
  process.env["COS_SID"] = "ダミーセッションID-テスト用"
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

  it("--from-file '-' (明示的なstdin指定) でstdinからコンテンツを読み込む", async () => {
    // citty が正しく "-" を渡したケース
    await runAppend({
      title: "テストページ",
      "from-file": "-",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    expect(capturedAppendCalls).toHaveLength(1)
    expect(capturedAppendCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedAppendCalls[0]?.lines).toContain("stdinの行2")
  })

  it("--from-file '' (citty のパースバグで空文字になったケース) でstdinからコンテンツを読み込む", async () => {
    // citty が --from-file - を "" に変換するバグへの対応
    await runAppend({
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
    expect(capturedAppendCalls).toHaveLength(1)
    expect(capturedAppendCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedAppendCalls[0]?.lines).toContain("stdinの行2")
  })
})
