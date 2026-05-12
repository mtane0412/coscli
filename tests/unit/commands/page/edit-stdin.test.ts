/**
 * page/edit-stdin.test.ts — `cos page edit` コマンドの stdin 読み込みテスト。
 *
 * citty のパースバグで --from-file - が "" として渡される問題の修正を検証する。
 * node:fs をモックして stdin (fd=0) から固定コンテンツを返す。
 * 既存の edit.test.ts はファイル I/O を使うため分離している。
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { pageEditCommand } from "@/commands/page/edit"

/** editPage に渡された引数をキャプチャする */
const capturedEditPageCalls: { lines: string[] }[] = []

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
  editPage: mock(
    async (_writer: unknown, opts: { project: string; title: string; lines: string[] }) => {
      capturedEditPageCalls.push({ lines: opts.lines })
      return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
    },
  ),
}))

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

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
  process.env["COS_SID"] = "ダミーセッションID-テスト用"
  capturedEditPageCalls.length = 0
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
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
    expect(capturedEditPageCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedEditPageCalls[0]?.lines).toContain("stdinの行2")
  })
})
