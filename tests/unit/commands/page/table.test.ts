/**
 * page/table.test.ts — `cos page table <title> <filename>` コマンドのテスト。
 *
 * テーブル CSV 取得の正常系・--json 出力・404 エラー・sandbox 違反を検証する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageTableCommand } from "@/commands/page/table"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_TITLE = "テストページ"
const TEST_FILENAME = "サンプルテーブル"
// Cosense テーブル API が返す CSV テキスト
const SAMPLE_CSV = "名前,年齢\n田中太郎,30\n鈴木花子,25"

const server = setupServer(
  // /api/table/:project/:title/:filename.csv モック
  http.get(`${BASE_URL}/api/table/:project/:title/:filename`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE &&
      decodeURIComponent(params["filename"] as string) === `${TEST_FILENAME}.csv`
    ) {
      return HttpResponse.text(SAMPLE_CSV)
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

async function runTable(args: Record<string, unknown>) {
  await (
    pageTableCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  // SID を設定 (ASCII のみ有効)
  process.env["COS_SID"] = "s%3Atest-session-id"
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  server.resetHandlers()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageTableCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runTable({
        title: TEST_TITLE,
        filename: TEST_FILENAME,
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("正常系: CSV テキストが stdout に出力される", async () => {
    try {
      await runTable({
        title: TEST_TITLE,
        filename: TEST_FILENAME,
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(output).toContain("名前,年齢")
    expect(output).toContain("田中太郎,30")
  })

  it("--json 指定時: envelope の data.csv に CSV テキストが含まれる", async () => {
    try {
      await runTable({
        title: TEST_TITLE,
        filename: TEST_FILENAME,
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as { data: { csv: string }; meta: { command: string } }
    expect(parsed.meta.command).toBe("page.table")
    expect(parsed.data.csv).toContain("名前,年齢")
    expect(parsed.data.csv).toContain("田中太郎,30")
  })

  it("存在しないテーブルの場合は exit 4 で終了する", async () => {
    try {
      await runTable({
        title: "存在しないページ",
        filename: "存在しないテーブル",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(4)
  })

  it("--disable-commands page.table 指定時は exit 7 で終了する", async () => {
    try {
      await runTable({
        title: TEST_TITLE,
        filename: TEST_FILENAME,
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
        "disable-commands": "page.table",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})
