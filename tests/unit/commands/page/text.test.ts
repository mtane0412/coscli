/**
 * page/text.test.ts — `cos page text <title>` コマンドのテスト。
 *
 * バリデーション (--format, --bold-style の無効値) と
 * --format=md による変換動作を検証する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageTextCommand } from "@/commands/page/text"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_TITLE = "テストページ"
// テキストエンドポイントが返す Scrapbox 本文 (タイトル行含む)
const SCRAPBOX_TEXT = `${TEST_TITLE}\n[*** 大見出し]\n本文テキスト`

const server = setupServer(
  // /api/pages/:project/:title/text モック
  http.get(`${BASE_URL}/api/pages/:project/:title/text`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE
    ) {
      return HttpResponse.text(SCRAPBOX_TEXT)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),
  // 認証確認用
  http.get(`${BASE_URL}/api/users/me`, () => {
    return HttpResponse.json({ id: "テストユーザーID", name: "テストユーザー" })
  }),
)

beforeAll(() => server.listen())
afterAll(() => server.close())

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

async function runText(args: Record<string, unknown>) {
  await (
    pageTextCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  process.env["COS_PROJECT"] = undefined
  process.env["COS_ENABLE_COMMANDS"] = undefined
  process.env["COS_DISABLE_COMMANDS"] = undefined
  // msw がテキストレスポンスを返せるよう connect.sid を設定 (ASCII のみ有効)
  process.env["COS_SID"] = "s%3Atest-session-id"
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  server.resetHandlers()
  process.env["COS_SID"] = undefined
})

describe("pageTextCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runText({
        title: TEST_TITLE,
        project: undefined,
        format: "txt",
        "bold-style": "auto",
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

  it("--format に未知の値を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    try {
      await runText({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        format: "xml",
        "bold-style": "auto",
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

  it("--bold-style に未知の値を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    try {
      await runText({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        format: "md",
        "bold-style": "unknown-style",
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

  it("--format=md のとき Scrapbox テキストが Markdown に変換されて出力される", async () => {
    try {
      await runText({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        format: "md",
        "bold-style": "auto",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    // h1 タイトルと ## 大見出しが MD 形式で出力される
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(calls).toContain("# テストページ")
    expect(calls).toContain("## 大見出し")
  })

  it("--format=txt (デフォルト) のとき Scrapbox テキストそのまま出力される", async () => {
    try {
      await runText({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        format: "txt",
        "bold-style": "auto",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(calls).toContain("[*** 大見出し]")
  })
})
