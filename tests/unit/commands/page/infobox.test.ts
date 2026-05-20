/**
 * page/infobox.test.ts — `cos page infobox <title>` コマンドのテスト。
 *
 * infoboxResult の取得・表示、--json / --no-hallucination フラグ、
 * エラー系・sandbox 違反を検証する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageInfoboxCommand } from "@/commands/page/infobox"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_TITLE = "製品仕様書"

/** infoboxResult が含まれるページレスポンスのモック */
const SAMPLE_PAGE = {
  id: "page-id-sample",
  title: TEST_TITLE,
  image: null,
  descriptions: ["製品の仕様を記述したページ"],
  user: { id: "user-id-1" },
  pin: 0,
  views: 42,
  linked: 5,
  created: 1700000000,
  updated: 1700100000,
  persistent: true,
  lines: [
    {
      id: "line-id-title",
      text: TEST_TITLE,
      userId: "user-id-1",
      created: 1700000000,
      updated: 1700000000,
    },
    {
      id: "line-id-1",
      text: "製品の仕様を記述したページ",
      userId: "user-id-1",
      created: 1700000001,
      updated: 1700000001,
    },
  ],
  links: [],
  icons: [],
  files: [],
  infoboxDefinition: ["table:infobox", "\t名前\t値"],
  infoboxResult: [
    {
      title: TEST_TITLE,
      infobox: { 製品名: "コスマネージャー", バージョン: "2.0", 担当者: "田中太郎" },
      hallucination: false,
      truncated: false,
    },
    {
      title: "関連ページA",
      infobox: { 製品名: "コスビューア", バージョン: "1.5" },
      hallucination: true,
      truncated: false,
    },
  ],
  infoboxDisableLinks: [],
}

/** infoboxResult が空のページレスポンス */
const EMPTY_INFOBOX_PAGE = {
  ...SAMPLE_PAGE,
  title: "infoboxなしページ",
  infoboxDefinition: [],
  infoboxResult: [],
}

const server = setupServer(
  // /api/pages/:project/:title モック
  http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
    const project = decodeURIComponent(params["project"] as string)
    const title = decodeURIComponent(params["title"] as string)
    if (project === TEST_PROJECT && title === TEST_TITLE) {
      return HttpResponse.json(SAMPLE_PAGE)
    }
    if (project === TEST_PROJECT && title === "infoboxなしページ") {
      return HttpResponse.json(EMPTY_INFOBOX_PAGE)
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

async function runInfobox(args: Record<string, unknown>) {
  await (
    pageInfoboxCommand.run as (ctx: {
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

describe("pageInfoboxCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runInfobox({
        title: TEST_TITLE,
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        "no-hallucination": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("正常系 (plain): 各 infoboxResult がタイトルとKey-Value形式で stdout に出力される", async () => {
    try {
      await runInfobox({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "no-hallucination": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(output).toContain(TEST_TITLE)
    expect(output).toContain("製品名")
    expect(output).toContain("コスマネージャー")
    expect(output).toContain("担当者")
    expect(output).toContain("田中太郎")
    // hallucination: true の関連ページも表示される
    expect(output).toContain("関連ページA")
  })

  it("--json 指定時: envelope の data.infoboxResult に配列が含まれる", async () => {
    try {
      await runInfobox({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        "no-hallucination": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as {
      data: { infoboxResult: Array<{ title: string; infobox: Record<string, string> }> }
      meta: { command: string }
    }
    expect(parsed.meta.command).toBe("page.infobox")
    expect(parsed.data.infoboxResult).toHaveLength(2)
    expect(parsed.data.infoboxResult[0]?.title).toBe(TEST_TITLE)
    expect(parsed.data.infoboxResult[0]?.infobox["製品名"]).toBe("コスマネージャー")
  })

  it("--no-hallucination 指定時: hallucination: true のアイテムが除外される", async () => {
    try {
      await runInfobox({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "no-hallucination": true,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    // hallucination: false のアイテムは含まれる
    expect(output).toContain(TEST_TITLE)
    expect(output).toContain("コスマネージャー")
    // hallucination: true のアイテムは除外される
    expect(output).not.toContain("関連ページA")
  })

  it("--no-hallucination --json 指定時: hallucination: true が除外された JSON が出力される", async () => {
    try {
      await runInfobox({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        "no-hallucination": true,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as {
      data: { infoboxResult: Array<{ hallucination: boolean }> }
    }
    // hallucination: false のアイテムのみ残る
    expect(parsed.data.infoboxResult).toHaveLength(1)
    expect(parsed.data.infoboxResult[0]?.hallucination).toBe(false)
  })

  it("infoboxResult が空のページでは空リストが返る (--json)", async () => {
    try {
      await runInfobox({
        title: "infoboxなしページ",
        project: TEST_PROJECT,
        json: true,
        plain: false,
        "results-only": false,
        "no-hallucination": false,
        quiet: false,
      })
    } catch {
      // REST クライアント初期化中の throw は想定内
    }
    const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    const parsed = JSON.parse(rawOutput) as {
      data: { infoboxResult: unknown[] }
    }
    expect(parsed.data.infoboxResult).toHaveLength(0)
  })

  it("存在しないページの場合は exit 4 で終了する", async () => {
    try {
      await runInfobox({
        title: "存在しないページ",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "no-hallucination": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(4)
  })

  it("--disable-commands page.infobox 指定時は exit 7 で終了する", async () => {
    try {
      await runInfobox({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "no-hallucination": false,
        quiet: false,
        "disable-commands": "page.infobox",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})
