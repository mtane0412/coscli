/**
 * page/insert.test.ts — `cos page insert <title> --after <n>` コマンドのテスト。
 *
 * --from-file での stdin 読み込み (- と "" の両対応) を含む。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs"
import { pageInsertCommand } from "@/commands/page/insert"
import * as pages from "@/core/pages"

/** insertIntoPage に渡された引数をキャプチャする */
const capturedInsertCalls: { lines: string[] }[] = []

// spyOn 前に実実装を保存する（モックが積み重なっても実ファイルアクセスができるように）
const realReadFileSync = fs.readFileSync.bind(fs)

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let readFileSyncSpy: ReturnType<typeof spyOn>
let insertIntoPageSpy: ReturnType<typeof spyOn>

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
  process.env["COS_SID"] = "s%3Atest-session-id"
  capturedInsertCalls.splice(0)
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
  insertIntoPageSpy = spyOn(pages, "insertIntoPage").mockImplementation(async (_writer, opts) => {
    capturedInsertCalls.push({ lines: opts.lines })
    return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
  })
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  readFileSyncSpy.mockRestore()
  insertIntoPageSpy.mockRestore()
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

  it("--after '' (citty のパースバグ: 負数が空文字になるケース) でエラーメッセージに process.argv の実値を表示する", async () => {
    // citty が --after -1 を --after "" + flag -1 として解析するバグへの対応
    // process.argv に実際のフラグ値が残っているため、そこから "-1" を取得してエラーメッセージに表示する
    const originalArgv = process.argv
    process.argv = ["bun", "cos", "--after", "-1"]
    try {
      await runInsert({
        title: "テストページ",
        after: "",
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
    } finally {
      process.argv = originalArgv
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    // JSON 出力では " が \" にエスケープされるため \"-1\" 形式で含まれることを確認する
    // (空文字 \"\" ではなく実値 \"-1\" が表示されること)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringMatching(/\\"-1\\"/))
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
