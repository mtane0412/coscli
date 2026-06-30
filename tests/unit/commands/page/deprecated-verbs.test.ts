/**
 * deprecated-verbs.test.ts — 非推奨化された読み取り verb の deprecation 動作テスト。
 *
 * PR 3 で page text/code/table/url/icon/context を deprecated ラッパーに変換した。
 * 各コマンドが実行時に [deprecated] 警告を stderr に出力し、
 * --json モードで meta.canonicalCommand / meta.deprecated を含むことを検証する。
 *
 * 既存テスト (page/text.test.ts 等) は変更しない。
 * このファイルは deprecation 固有の振る舞いのみをテストする。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageContextCommand } from "@/commands/page/context"
import { pageIconCommand } from "@/commands/page/icon"
import { pageTextCommand } from "@/commands/page/text"
import { pageUrlCommand } from "@/commands/page/url"
import { http, HttpResponse } from "msw"
import { useMswServer } from "../../../helpers/msw"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_TITLE = "テストページ"
const SCRAPBOX_TEXT = `${TEST_TITLE}\n本文テキスト`

useMswServer([
  http.get(`${BASE_URL}/api/pages/:project/:title/text`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE
    ) {
      return HttpResponse.text(SCRAPBOX_TEXT)
    }
    return HttpResponse.text("Not found", { status: 404 })
  }),
  http.get(`${BASE_URL}/api/code/:project/:title/:filename`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE
    ) {
      return HttpResponse.text("const x = 1")
    }
    return HttpResponse.text("Not found", { status: 404 })
  }),
  http.get(`${BASE_URL}/api/table/:project/:title/:filename`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE
    ) {
      return HttpResponse.text("名前,値\n田中,100")
    }
    return HttpResponse.text("Not found", { status: 404 })
  }),
  http.get(`${BASE_URL}/api/smart-context/export-1hop-links/:project`, ({ params, request }) => {
    const projectParam = decodeURIComponent(params["project"] as string)
    const project = projectParam.endsWith(".txt") ? projectParam.slice(0, -4) : projectParam
    const url = new URL(request.url)
    const title = url.searchParams.get("title")
    if (project === TEST_PROJECT && title === TEST_TITLE) {
      return new HttpResponse("コンテキストテキスト")
    }
    return new HttpResponse("Not found", { status: 404 })
  }),
  http.get(`${BASE_URL}/api/users/me`, () => {
    return HttpResponse.json({ id: "uid-テスト", name: "テストユーザー" })
  }),
])

type RunFn = (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void> | void

const COMMON_ARGS = {
  project: TEST_PROJECT,
  json: false,
  plain: false,
  "results-only": false,
  quiet: false,
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_SILENCE_DEPRECATION")
  process.env["COS_SID"] = "s%3Atest-session-id"
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_SILENCE_DEPRECATION")
})

function getStderrOutput(): string {
  return (stderrMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
}

function getStdoutOutput(): string {
  return (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
}

// --- page text ---
describe("pageTextCommand (deprecated)", () => {
  async function runText(args: Record<string, unknown>) {
    try {
      await (pageTextCommand.run as RunFn)({
        args: {
          ...COMMON_ARGS,
          title: TEST_TITLE,
          format: "txt",
          "bold-style": "auto",
          "body-only": false,
          ...args,
        },
        cmd: {} as never,
        rawArgs: [],
      })
    } catch {}
  }

  it("実行時に [deprecated] 警告を stderr に出力する", async () => {
    await runText({})
    expect(getStderrOutput()).toContain("[deprecated]")
    expect(getStderrOutput()).toContain("page text")
  })

  it("COS_SILENCE_DEPRECATION=1 のとき警告を出力しない", async () => {
    process.env["COS_SILENCE_DEPRECATION"] = "1"
    await runText({})
    expect(getStderrOutput()).not.toContain("[deprecated]")
  })

  it("--json 出力に meta.canonicalCommand が含まれる", async () => {
    await runText({ json: true })
    const raw = getStdoutOutput()
    if (!raw) return
    const parsed = JSON.parse(raw) as { meta: { command: string; canonicalCommand?: string } }
    // meta.command は後方互換のため旧識別子を維持する
    expect(parsed.meta.command).toBe("page.text")
    expect(parsed.meta.canonicalCommand).toBe("page.get")
  })

  it("--json 出力に meta.deprecated が含まれる", async () => {
    await runText({ json: true })
    const raw = getStdoutOutput()
    if (!raw) return
    const parsed = JSON.parse(raw) as { meta: { deprecated?: { replacement: string } } }
    expect(parsed.meta.deprecated?.replacement).toContain("page get --format")
  })
})

// --- page url ---
describe("pageUrlCommand (deprecated)", () => {
  async function runUrl(args: Record<string, unknown>) {
    try {
      await (pageUrlCommand.run as RunFn)({
        args: { ...COMMON_ARGS, title: TEST_TITLE, ...args },
        cmd: {} as never,
        rawArgs: [],
      })
    } catch {}
  }

  it("実行時に [deprecated] 警告を stderr に出力する", async () => {
    await runUrl({})
    expect(getStderrOutput()).toContain("[deprecated]")
    expect(getStderrOutput()).toContain("page url")
  })

  it("--json 出力に meta.canonicalCommand が含まれる", async () => {
    await runUrl({ json: true })
    const raw = getStdoutOutput()
    if (!raw) return
    const parsed = JSON.parse(raw) as { meta: { command: string; canonicalCommand?: string } }
    expect(parsed.meta.command).toBe("page.url")
    expect(parsed.meta.canonicalCommand).toBe("page.get")
  })

  it("--json 出力に meta.deprecated が含まれる", async () => {
    await runUrl({ json: true })
    const raw = getStdoutOutput()
    if (!raw) return
    const parsed = JSON.parse(raw) as { meta: { deprecated?: { replacement: string } } }
    expect(parsed.meta.deprecated?.replacement).toContain("page get --format=url")
  })
})

// --- page icon ---
describe("pageIconCommand (deprecated)", () => {
  async function runIcon(args: Record<string, unknown>) {
    try {
      await (pageIconCommand.run as RunFn)({
        args: { ...COMMON_ARGS, title: TEST_TITLE, ...args },
        cmd: {} as never,
        rawArgs: [],
      })
    } catch {}
  }

  it("実行時に [deprecated] 警告を stderr に出力する", async () => {
    await runIcon({})
    expect(getStderrOutput()).toContain("[deprecated]")
    expect(getStderrOutput()).toContain("page icon")
  })

  it("--json 出力に meta.canonicalCommand が含まれる", async () => {
    await runIcon({ json: true })
    const raw = getStdoutOutput()
    if (!raw) return
    const parsed = JSON.parse(raw) as { meta: { command: string; canonicalCommand?: string } }
    expect(parsed.meta.command).toBe("page.icon")
    expect(parsed.meta.canonicalCommand).toBe("page.get")
  })
})

// --- page context ---
describe("pageContextCommand (deprecated)", () => {
  async function runContext(args: Record<string, unknown>) {
    try {
      await (pageContextCommand.run as RunFn)({
        args: { ...COMMON_ARGS, title: TEST_TITLE, hops: "1", query: "", ...args },
        cmd: {} as never,
        rawArgs: [],
      })
    } catch {}
  }

  it("実行時に [deprecated] 警告を stderr に出力する", async () => {
    await runContext({})
    expect(getStderrOutput()).toContain("[deprecated]")
    expect(getStderrOutput()).toContain("page context")
  })

  it("--json 出力に meta.canonicalCommand が含まれる", async () => {
    await runContext({ json: true })
    const raw = getStdoutOutput()
    if (!raw) return
    const parsed = JSON.parse(raw) as { meta: { command: string; canonicalCommand?: string } }
    expect(parsed.meta.command).toBe("page.context")
    expect(parsed.meta.canonicalCommand).toBe("page.get")
  })
})
