/**
 * page/new.test.ts — `cos page new <title>` コマンドのテスト。
 *
 * --line の \n 展開と --dry-run 時の success メッセージ抑制を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { pageNewCommand } from "@/commands/page/new"

/** createPage に渡された引数をキャプチャする */
const capturedCreatePageCalls: { lines: string[] }[] = []

// Bun は mock.module をファイル先頭にホイストするため import より前に評価される
mock.module("@/core/pages", () => ({
  createPage: mock(
    async (_writer: unknown, opts: { project: string; title: string; lines: string[] }) => {
      capturedCreatePageCalls.push({ lines: opts.lines })
      return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
    },
  ),
}))

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runNew(args: Record<string, unknown>) {
  await (
    pageNewCommand.run as (ctx: {
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
  capturedCreatePageCalls.length = 0
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageNewCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runNew({
        title: "テストページ",
        line: "本文テキスト",
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
      await runNew({
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

  it("--line '行1\\n行2' は createPage に2行で渡される", async () => {
    await runNew({
      title: "テストページ",
      line: "行1\\n行2",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // createPage が呼ばれ、lines が ["行1", "行2"] に分割されること
    expect(capturedCreatePageCalls).toHaveLength(1)
    expect(capturedCreatePageCalls[0]?.lines).toEqual(["行1", "行2"])
  })

  it("--dry-run 時は success メッセージが stderr に出力されない", async () => {
    await runNew({
      title: "テストページ",
      line: "本文テキスト",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": true,
      quiet: false,
    })
    // dry-run 時は success メッセージが出力されないこと
    const stderrOutput = (stderrMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stderrOutput).not.toContain("作成しました")
  })
})
