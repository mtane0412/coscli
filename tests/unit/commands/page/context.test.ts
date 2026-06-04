/**
 * page/context.test.ts — `cos page context <title>` コマンドのテスト。
 *
 * --hops バリデーション、1hop/2hop エンドポイント切り替え、--json envelope 出力、
 * --query フィルタリングを検証する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageContextCommand } from "@/commands/page/context"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_TITLE = "テストページ"
const SMART_CONTEXT_1HOP = "1hop Smart Context テキスト"
const SMART_CONTEXT_2HOP = "2hop Smart Context テキスト"

/**
 * --query テスト用の複数ページセクションを含む Smart Context テキスト。
 * 実際の API が返す <Page title="...">...</Page> XML 形式を再現する。
 */
const SMART_CONTEXT_MULTI_SECTION =
  "<PageList>\n" +
  '<Page title="東京タワー" url="https://scrapbox.io/テストプロジェクト/東京タワー" updated="2026-01-01T00:00:00.000Z" created="2026-01-01T00:00:00.000Z" type="1hopLink">\n' +
  "東京都港区芝公園にある電波塔。高さ333m。\n" +
  "</Page>\n\n\n" +
  '<Page title="スカイツリー" url="https://scrapbox.io/テストプロジェクト/スカイツリー" updated="2026-01-01T00:00:00.000Z" created="2026-01-01T00:00:00.000Z" type="1hopLink">\n' +
  "東京都墨田区にある電波塔。東京タワーより高く634m。\n" +
  "</Page>\n\n\n" +
  '<Page title="名古屋城" url="https://scrapbox.io/テストプロジェクト/名古屋城" updated="2026-01-01T00:00:00.000Z" created="2026-01-01T00:00:00.000Z" type="1hopLink">\n' +
  "愛知県名古屋市にある城。金のしゃちほこで有名。\n" +
  "</Page>\n" +
  "</PageList>"

const server = setupServer(
  // Smart Context: 1hop
  http.get(`${BASE_URL}/api/smart-context/export-1hop-links/:project`, ({ params, request }) => {
    const projectParam = decodeURIComponent(params["project"] as string)
    const project = projectParam.endsWith(".txt") ? projectParam.slice(0, -4) : projectParam
    const url = new URL(request.url)
    const title = url.searchParams.get("title")
    if (project === TEST_PROJECT && title === TEST_TITLE) {
      return new HttpResponse(SMART_CONTEXT_1HOP)
    }
    return new HttpResponse("Not found", { status: 404 })
  }),
  // Smart Context: 2hop
  http.get(`${BASE_URL}/api/smart-context/export-2hop-links/:project`, ({ params, request }) => {
    const projectParam = decodeURIComponent(params["project"] as string)
    const project = projectParam.endsWith(".txt") ? projectParam.slice(0, -4) : projectParam
    const url = new URL(request.url)
    const title = url.searchParams.get("title")
    if (project === TEST_PROJECT && title === TEST_TITLE) {
      return new HttpResponse(SMART_CONTEXT_2HOP)
    }
    return new HttpResponse("Not found", { status: 404 })
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

async function runContext(args: Record<string, unknown>) {
  await (
    pageContextCommand.run as (ctx: {
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
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  server.resetHandlers()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageContextCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runContext({
        title: TEST_TITLE,
        project: undefined,
        hops: 1,
        query: "",
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

  it("--hops に 1/2 以外の値を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    try {
      await runContext({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        hops: 3,
        query: "",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
  })

  it("--hops=1 (デフォルト) で 1hop のテキストが stdout に出力される", async () => {
    await runContext({
      title: TEST_TITLE,
      project: TEST_PROJECT,
      hops: 1,
      query: "",
      json: false,
      plain: false,
      "results-only": false,
      quiet: false,
    })
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(calls).toContain(SMART_CONTEXT_1HOP)
  })

  it("--hops=2 で 2hop のテキストが stdout に出力される", async () => {
    await runContext({
      title: TEST_TITLE,
      project: TEST_PROJECT,
      hops: 2,
      query: "",
      json: false,
      plain: false,
      "results-only": false,
      quiet: false,
    })
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(calls).toContain(SMART_CONTEXT_2HOP)
  })

  it("--json 指定時に { text: ... } envelope が出力される", async () => {
    await runContext({
      title: TEST_TITLE,
      project: TEST_PROJECT,
      hops: 1,
      query: "",
      json: true,
      plain: false,
      "results-only": false,
      quiet: false,
    })
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(calls)
    expect(parsed.data.text).toBe(SMART_CONTEXT_1HOP)
  })

  describe("--query オプション", () => {
    // 各テストで複数セクションの Smart Context を返すようにハンドラを上書きする
    beforeEach(() => {
      server.use(
        http.get(
          `${BASE_URL}/api/smart-context/export-1hop-links/:project`,
          ({ params, request }) => {
            const projectParam = decodeURIComponent(params["project"] as string)
            const project = projectParam.endsWith(".txt") ? projectParam.slice(0, -4) : projectParam
            const url = new URL(request.url)
            const title = url.searchParams.get("title")
            if (project === TEST_PROJECT && title === TEST_TITLE) {
              return new HttpResponse(SMART_CONTEXT_MULTI_SECTION)
            }
            return new HttpResponse("Not found", { status: 404 })
          },
        ),
      )
    })

    it("--query に一致するセクションのみ stdout に出力される", async () => {
      // 「東京」を含むセクションは「東京タワー」と「スカイツリー」、含まないのは「名古屋城」
      await runContext({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        hops: 1,
        query: "東京",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("東京タワー")
      expect(output).toContain("スカイツリー")
      expect(output).not.toContain("名古屋城")
    })

    it("--query に一致するセクションが0件の場合は空文字を出力する", async () => {
      // 「大阪」はどのセクションにも含まれない
      await runContext({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        hops: 1,
        query: "大阪",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output.trim()).toBe("")
    })

    it("--query + --json でフィルタ済みテキストが data.text に含まれる", async () => {
      // 「名古屋城」のみを含むクエリ
      await runContext({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        hops: 1,
        query: "しゃちほこ",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      const parsed = JSON.parse(output)
      expect(parsed.data.text).toContain("名古屋城")
      expect(parsed.data.text).not.toContain("東京タワー")
      expect(parsed.data.text).not.toContain("スカイツリー")
    })

    it("--query 未指定の場合はフィルタなしでテキスト全体を返す", async () => {
      await runContext({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        hops: 1,
        query: "",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("東京タワー")
      expect(output).toContain("スカイツリー")
      expect(output).toContain("名古屋城")
    })
  })
})
