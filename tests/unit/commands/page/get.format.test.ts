/**
 * page/get.format.test.ts — `cos page get <title> --format=<value>` のテスト。
 *
 * PR 1 で追加した --format 拡張 (text/md/scrapbox/context/code/table/url/icon) の
 * 振る舞いを検証する。--format ai のテストは get.test.ts に残す。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageGetCommand } from "@/commands/page/get"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_TITLE = "テストページ"
const TEST_FILENAME = "サンプルコード.ts"
const TEST_TABLE = "データテーブル"

const SCRAPBOX_TEXT = `${TEST_TITLE}\n[*** 大見出し]\n本文テキスト`
const SAMPLE_CODE = "const hello = () => console.log('こんにちは')"
const SAMPLE_CSV = "名前,スコア\n田中太郎,100\n鈴木花子,95"
const SMART_CONTEXT_TEXT = "1hop Smart Context テキスト — 関連ページの内容"

const server = setupServer(
  // ページテキスト取得
  http.get(`${BASE_URL}/api/pages/:project/:title/text`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE
    ) {
      return HttpResponse.text(SCRAPBOX_TEXT)
    }
    return HttpResponse.text("Not found", { status: 404 })
  }),
  // コードブロック取得
  http.get(`${BASE_URL}/api/code/:project/:title/:filename`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE
    ) {
      return HttpResponse.text(SAMPLE_CODE)
    }
    return HttpResponse.text("Not found", { status: 404 })
  }),
  // テーブル取得
  http.get(`${BASE_URL}/api/table/:project/:title/:filename`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE
    ) {
      return HttpResponse.text(SAMPLE_CSV)
    }
    return HttpResponse.text("Not found", { status: 404 })
  }),
  // Smart Context 1hop
  http.get(`${BASE_URL}/api/smart-context/export-1hop-links/:project`, ({ params, request }) => {
    const projectParam = decodeURIComponent(params["project"] as string)
    const project = projectParam.endsWith(".txt") ? projectParam.slice(0, -4) : projectParam
    const url = new URL(request.url)
    const title = url.searchParams.get("title")
    if (project === TEST_PROJECT && title === TEST_TITLE) {
      return new HttpResponse(SMART_CONTEXT_TEXT)
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

/** runGet は citty の arg パースを経由せずに直接 run() を呼ぶため、デフォルト値を明示する */
async function runGet(args: Record<string, unknown>) {
  const defaults = {
    json: false,
    plain: false,
    "results-only": false,
    quiet: false,
    hops: "1",
    query: "",
    "bold-style": "auto",
    "body-only": false,
  }
  await (
    pageGetCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
  )({
    args: { ...defaults, ...args },
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

describe("pageGetCommand --format 拡張", () => {
  describe("--format text", () => {
    it("ページのプレーンテキストを stdout に出力する", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "text",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("[*** 大見出し]")
      expect(output).toContain("本文テキスト")
    })

    it("--json 指定時は envelope の data.text にテキストが含まれる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "text",
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      const parsed = JSON.parse(rawOutput) as { data: { text: string }; meta: { command: string } }
      expect(parsed.meta.command).toBe("page.get")
      expect(parsed.data.text).toContain("[*** 大見出し]")
    })
  })

  describe("--format txt (text の alias)", () => {
    it("--format txt も text と同じ動作をする", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "txt",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("[*** 大見出し]")
    })
  })

  describe("--format md", () => {
    it("Scrapbox テキストを Markdown に変換して stdout に出力する", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "md",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      // [*** 大見出し] が ## 大見出し に変換される
      expect(output).toContain("## 大見出し")
      expect(output).not.toContain("[*** 大見出し]")
    })
  })

  describe("--format scrapbox", () => {
    it("--format scrapbox は txt と同じ Scrapbox テキストそのまま出力する", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "scrapbox",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("[*** 大見出し]")
    })
  })

  describe("--format url", () => {
    it("API 呼び出しなしでページ URL を stdout に出力する", async () => {
      // URL 生成はローカルで完結するため API モックは不要
      await runGet({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        format: "url",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("scrapbox.io")
      expect(output).toContain(encodeURIComponent(TEST_PROJECT))
    })

    it("--json 指定時は envelope の data.url に URL が含まれる", async () => {
      await runGet({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        format: "url",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })
      const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      const parsed = JSON.parse(rawOutput) as { data: { url: string }; meta: { command: string } }
      expect(parsed.meta.command).toBe("page.get")
      expect(parsed.data.url).toContain("scrapbox.io")
    })
  })

  describe("--format icon", () => {
    it("API 呼び出しなしでページアイコン URL を stdout に出力する", async () => {
      await runGet({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        format: "icon",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("scrapbox.io")
      expect(output).toContain("/icon")
    })

    it("--json 指定時は envelope の data.icon にアイコン URL が含まれる", async () => {
      await runGet({
        title: TEST_TITLE,
        project: TEST_PROJECT,
        format: "icon",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })
      const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      const parsed = JSON.parse(rawOutput) as { data: { icon: string }; meta: { command: string } }
      expect(parsed.meta.command).toBe("page.get")
      expect(parsed.data.icon).toContain("/icon")
    })
  })

  describe("--format context", () => {
    it("Smart Context テキストを stdout に出力する", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "context",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain(SMART_CONTEXT_TEXT)
    })

    it("--json 指定時は envelope の data.text にコンテキストテキストが含まれる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "context",
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      const parsed = JSON.parse(rawOutput) as { data: { text: string }; meta: { command: string } }
      expect(parsed.meta.command).toBe("page.get")
      expect(parsed.data.text).toContain(SMART_CONTEXT_TEXT)
    })
  })

  describe("--format code", () => {
    it("コードブロックを stdout に出力する", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "code",
          filename: TEST_FILENAME,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain(SAMPLE_CODE)
    })

    it("--filename なしで VALIDATION_ERROR exit 5 になる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "code",
          filename: undefined,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      expect(exitMock).toHaveBeenCalledWith(5)
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("VALIDATION_ERROR")
      expect(output).toContain("--filename")
    })

    it("--json 指定時は envelope の data.code にコードが含まれる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "code",
          filename: TEST_FILENAME,
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const rawOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      const parsed = JSON.parse(rawOutput) as { data: { code: string }; meta: { command: string } }
      expect(parsed.meta.command).toBe("page.get")
      expect(parsed.data.code).toContain("hello")
    })
  })

  describe("--format table", () => {
    it("テーブル CSV を stdout に出力する", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "table",
          filename: TEST_TABLE,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("名前,スコア")
      expect(output).toContain("田中太郎,100")
    })

    it("--filename なしで VALIDATION_ERROR exit 5 になる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "table",
          filename: undefined,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      expect(exitMock).toHaveBeenCalledWith(5)
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("VALIDATION_ERROR")
      expect(output).toContain("--filename")
    })
  })

  describe("--format バリデーション", () => {
    it("未知の format 値は VALIDATION_ERROR exit 5 になる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "unknown-format",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      expect(exitMock).toHaveBeenCalledWith(5)
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("VALIDATION_ERROR")
    })
  })
})
