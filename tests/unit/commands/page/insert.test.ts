/**
 * page/insert.test.ts — `cos page insert <title> --after <n>` コマンドのテスト。
 *
 * --from-file での stdin 読み込み (- と "" の両対応) を含む。
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { pageInsertCommand } from "@/commands/page/insert"

/** insertIntoPage に渡された引数をキャプチャする */
const capturedInsertCalls: { lines: string[] }[] = []

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
  insertIntoPage: mock(
    async (
      _writer: unknown,
      opts: { project: string; title: string; after: number; lines: string[] },
    ) => {
      capturedInsertCalls.push({ lines: opts.lines })
      return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
    },
  ),
}))

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runInsert(args: Record<string, unknown>) {
  await (
    pageInsertCommand.run as (ctx: {
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
  capturedInsertCalls.length = 0
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageInsertCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runInsert({
        title: "テストページ",
        after: "2",
        line: "挿入行",
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

  it("--after に数値以外を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    try {
      await runInsert({
        title: "テストページ",
        after: "abc",
        line: "挿入行",
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
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
  })

  it("--after に 0 を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    try {
      await runInsert({
        title: "テストページ",
        after: "0",
        line: "挿入行",
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
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
  })

  it("--line も --from-file も指定しない場合は CONTENT_REQUIRED で exit 5", async () => {
    try {
      await runInsert({
        title: "テストページ",
        after: "1",
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

  it("--line に実改行を含む文字列を渡すと insertIntoPage に2行で渡される", async () => {
    // $'挿入行A\n挿入行B' のようなシェル実改行を含む文字列を渡した場合の検証
    await runInsert({
      title: "テストページ",
      after: "1",
      line: "挿入行A\n挿入行B",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // 実改行（\n）が展開され、lines が ["挿入行A", "挿入行B"] の2行になること
    expect(capturedInsertCalls).toHaveLength(1)
    expect(capturedInsertCalls[0]?.lines).toEqual(["挿入行A", "挿入行B"])
  })

  it("--from-file '-' (明示的なstdin指定) でstdinからコンテンツを読み込む", async () => {
    // citty が正しく "-" を渡したケース
    await runInsert({
      title: "テストページ",
      after: "1",
      "from-file": "-",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    expect(capturedInsertCalls).toHaveLength(1)
    expect(capturedInsertCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedInsertCalls[0]?.lines).toContain("stdinの行2")
  })

  it("--from-file '' (citty のパースバグで空文字になったケース) でstdinからコンテンツを読み込む", async () => {
    // citty が --from-file - を "" に変換するバグへの対応
    await runInsert({
      title: "テストページ",
      after: "1",
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
    expect(capturedInsertCalls).toHaveLength(1)
    expect(capturedInsertCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedInsertCalls[0]?.lines).toContain("stdinの行2")
  })
})
