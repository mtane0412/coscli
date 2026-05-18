/**
 * page/new.test.ts — `cos page new <title>` コマンドのテスト。
 *
 * --line の \n 展開、--line 複数指定、--dry-run 時の success メッセージ抑制、
 * --from-file - / "" での stdin 読み込みを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs"
import { pageNewCommand } from "@/commands/page/new"
import * as pages from "@/core/pages"

/** createPage に渡された引数をキャプチャする */
const capturedCreatePageCalls: { lines: string[] }[] = []

// spyOn 前に実実装を保存する（モックが積み重なっても実ファイルアクセスができるように）
const realReadFileSync = fs.readFileSync.bind(fs)

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let readFileSyncSpy: ReturnType<typeof spyOn>
let createPageSpy: ReturnType<typeof spyOn>

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
  process.env["COS_SID"] = "s%3Atest-session-id"
  // 各テスト前にキャプチャを初期化する
  capturedCreatePageCalls.length = 0
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
  createPageSpy = spyOn(pages, "createPage").mockImplementation(async (_writer, opts) => {
    capturedCreatePageCalls.push({ lines: opts.lines })
    return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
  })
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  readFileSyncSpy.mockRestore()
  createPageSpy.mockRestore()
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

  it("--line を配列で複数指定した場合は createPage に複数行で渡される", async () => {
    await runNew({
      title: "テストページ",
      line: ["行1", "行2", "行3"],
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // --line を複数回渡すと citty が配列にするため、lines に全要素が渡されること
    expect(capturedCreatePageCalls).toHaveLength(1)
    expect(capturedCreatePageCalls[0]?.lines).toEqual(["行1", "行2", "行3"])
  })

  it("--line を配列で渡した場合も \\n 区切りが展開される", async () => {
    await runNew({
      title: "テストページ",
      line: ["行1\\n行2", "行3"],
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // 配列内の各要素も \n で分割されること
    expect(capturedCreatePageCalls).toHaveLength(1)
    expect(capturedCreatePageCalls[0]?.lines).toEqual(["行1", "行2", "行3"])
  })

  it("--line 配列要素内の実改行も展開される", async () => {
    await runNew({
      title: "テストページ",
      line: ["行1\n行2", "行3"],
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // 配列要素内の実改行（\n）も分割されること
    expect(capturedCreatePageCalls).toHaveLength(1)
    expect(capturedCreatePageCalls[0]?.lines).toEqual(["行1", "行2", "行3"])
  })

  it("--from-file '-' (明示的なstdin指定) でstdinからコンテンツを読み込む", async () => {
    // citty が正しく "-" を渡したケース
    await runNew({
      title: "テストページ",
      "from-file": "-",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // stdin からコンテンツが読み込まれ createPage に渡されること
    expect(capturedCreatePageCalls).toHaveLength(1)
    expect(capturedCreatePageCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedCreatePageCalls[0]?.lines).toContain("stdinの行2")
  })

  it("--from-file '' (citty のパースバグで空文字になったケース) でstdinからコンテンツを読み込む", async () => {
    // citty が --from-file - を "" に変換するバグへの対応
    await runNew({
      title: "テストページ",
      "from-file": "",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // "" もstdinとして扱われ、createPage にコンテンツが渡されること
    expect(capturedCreatePageCalls).toHaveLength(1)
    expect(capturedCreatePageCalls[0]?.lines).toContain("stdinの行1")
    expect(capturedCreatePageCalls[0]?.lines).toContain("stdinの行2")
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
