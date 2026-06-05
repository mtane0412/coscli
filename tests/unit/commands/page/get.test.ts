/**
 * page/get.test.ts — `cos page get <title>` コマンドのテスト。
 *
 * --format ai オプションによる AI 向け Markdown 出力と、
 * バリデーション（無効な --format 値）を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageGetCommand } from "@/commands/page/get"
import { http, HttpResponse } from "msw"
import { useMswServer } from "../../../helpers/msw"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_TITLE = "テストページ"

/** テスト用ページAPIレスポンス */
const PAGE_RESPONSE = {
  id: "page-id-001",
  title: TEST_TITLE,
  created: 1700000000,
  updated: 1700100000,
  views: 10,
  linked: 3,
  commitId: "commit-abc",
  lines: [
    { id: "l0", text: TEST_TITLE, userId: "uid-山田", created: 1700000000, updated: 1700000000 },
    { id: "l1", text: "本文1行目", userId: "uid-山田", created: 1700000000, updated: 1700050000 },
    { id: "l2", text: "本文2行目", userId: "uid-鈴木", created: 1700000000, updated: 1700100000 },
  ],
  user: { id: "uid-山田", name: "yamada", displayName: "山田太郎" },
  relatedPages: {
    links1hop: [{ id: "rel1", title: "リンク先ページ", created: 1700000000, updated: 1700000000 }],
  },
}

/** テスト用メンバーAPIレスポンス */
const MEMBERS_RESPONSE = {
  users: [
    { id: "uid-山田", name: "yamada", displayName: "山田太郎", created: 0, updated: 0 },
    { id: "uid-鈴木", name: "suzuki", displayName: "鈴木次郎", created: 0, updated: 0 },
  ],
}

useMswServer([
  http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
    if (
      decodeURIComponent(params["project"] as string) === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === TEST_TITLE
    ) {
      return HttpResponse.json(PAGE_RESPONSE)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),
  http.get(`${BASE_URL}/api/projects/:project/users`, ({ params }) => {
    if (decodeURIComponent(params["project"] as string) === TEST_PROJECT) {
      return HttpResponse.json(MEMBERS_RESPONSE)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),
  http.get(`${BASE_URL}/api/users/me`, () => {
    return HttpResponse.json({ id: "uid-山田", name: "yamada" })
  }),
])

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

async function runGet(args: Record<string, unknown>) {
  await (
    pageGetCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
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
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageGetCommand", () => {
  describe("--format ai", () => {
    it("出力に # ページタイトルの見出しが含まれる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "ai",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain(`# ${TEST_TITLE}`)
    })

    it("出力にメタデータセクションの pageId が含まれる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "ai",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("page-id-001")
    })

    it("出力に本文行が含まれる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "ai",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("本文1行目")
      expect(output).toContain("本文2行目")
    })

    it("出力に 1-hop 関連ページが含まれる", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "ai",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {}
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("リンク先ページ")
    })

    it("--format ai --json を同時指定すると VALIDATION_ERROR で exit 5", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "ai",
          json: true,
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

  describe("バリデーション", () => {
    it("--format に無効値を指定すると VALIDATION_ERROR で exit 5", async () => {
      try {
        await runGet({
          title: TEST_TITLE,
          project: TEST_PROJECT,
          format: "xml",
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
