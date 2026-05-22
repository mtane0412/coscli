/**
 * page/snapshot/list.test.ts — `cos page snapshot list <title>` コマンドのテスト。
 *
 * - 正常系: スナップショット一覧が JSON で取れる
 * - getPage が呼ばれて pageId が getPageSnapshotList に正しく渡ること
 * - --plain で <id>  <created_date> 形式の 1 行が出力される
 * - project 未指定 → exit 5
 * - title 空 → exit 5
 * - 認証エラー → exit 2
 * - 404 (ページ未存在) → exit 4
 * - 403 (権限なし) → exit 3
 * - sandbox 違反 → exit 7
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageSnapshotListCommand } from "@/commands/page/snapshot/list"
import { AuthError, ForbiddenError, NotFoundError } from "@/core/api/rest"
import * as pages from "@/core/pages"
import type { Page } from "@/schemas/page"
import type { PageSnapshotList } from "@/schemas/snapshot"
import pageDetailFixture from "../../../../fixtures/page-detail.json"
import pageSnapshotsListFixture from "../../../../fixtures/snapshots/page-snapshots-list.json"

/** コマンド run ヘルパー */
async function runSnapshotList(args: Record<string, unknown>) {
  await (
    pageSnapshotListCommand.run as (ctx: {
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

/** デフォルトの正常系引数 */
const defaultArgs = {
  project: "テストプロジェクト",
  title: "Hello World",
  json: true,
  plain: false,
  "results-only": false,
  quiet: false,
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let getPageSpy: ReturnType<typeof spyOn>
let getPageSnapshotListSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"

  // getPage のモック (title → pageId 解決)
  getPageSpy = spyOn(pages, "getPage").mockResolvedValue(pageDetailFixture as unknown as Page)

  // getPageSnapshotList のモック
  getPageSnapshotListSpy = spyOn(pages, "getPageSnapshotList").mockResolvedValue(
    pageSnapshotsListFixture as PageSnapshotList,
  )
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  getPageSpy.mockRestore()
  getPageSnapshotListSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageSnapshotListCommand", () => {
  describe("正常系", () => {
    it("--json フラグ付きでスナップショット一覧が JSON 出力される", async () => {
      try {
        await runSnapshotList(defaultArgs)
      } catch {
        // process.exit モック後の継続による throw は想定内
      }

      // exit が呼ばれていない = エラーなし
      expect(exitMock).not.toHaveBeenCalled()

      // stdout に JSON が書き込まれた
      expect(stdoutMock).toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.pageId).toBe("page-id-hello")
      expect(parsed.data.timestamps).toHaveLength(3)
    })

    it("getPage → getPageSnapshotList の順で pageId が渡ること", async () => {
      try {
        await runSnapshotList(defaultArgs)
      } catch {
        // 想定内
      }

      // getPage が title で呼ばれた
      expect(getPageSpy).toHaveBeenCalledTimes(1)
      const getPageOpts = getPageSpy.mock.calls[0]?.[1] as { project: string; title: string }
      expect(getPageOpts.title).toBe("Hello World")

      // getPageSnapshotList が pageId で呼ばれた
      expect(getPageSnapshotListSpy).toHaveBeenCalledTimes(1)
      const snapshotOpts = getPageSnapshotListSpy.mock.calls[0]?.[1] as {
        project: string
        pageId: string
      }
      expect(snapshotOpts.pageId).toBe(pageDetailFixture.id)
    })

    it("--plain で TSV 形式（ヘッダー行 + データ行）が出力される", async () => {
      try {
        await runSnapshotList({ ...defaultArgs, json: false, plain: true })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()

      // writeTsv: ヘッダー1行 + フィクスチャ3件 = 4回 write が呼ばれる
      const writtenLines = stdoutMock.mock.calls.map((c: unknown[]) => c[0] as string)
      expect(writtenLines).toHaveLength(4)
      // ヘッダー行はタブ区切りの列名
      expect(writtenLines[0]).toBe("id\tcreated\n")
      // データ行はタブ区切りの id と ISO 8601 日時
      expect(writtenLines[1]).toMatch(/^1700000000-snap2\t20\d{2}-/)
    })
  })

  describe("バリデーションエラー", () => {
    it("project 未指定は VALIDATION_ERROR (exit 5) になる", async () => {
      try {
        await runSnapshotList({ ...defaultArgs, project: undefined })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("title が空文字は VALIDATION_ERROR (exit 5) になる", async () => {
      try {
        await runSnapshotList({ ...defaultArgs, title: "" })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("API エラー", () => {
    it("AuthError は exit 2 になる", async () => {
      getPageSpy.mockRejectedValue(new AuthError())
      try {
        await runSnapshotList(defaultArgs)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(2)
    })

    it("NotFoundError は exit 4 になる", async () => {
      getPageSpy.mockRejectedValue(new NotFoundError("テストページ"))
      try {
        await runSnapshotList(defaultArgs)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(4)
    })

    it("ForbiddenError は exit 3 になる", async () => {
      getPageSpy.mockRejectedValue(new ForbiddenError())
      try {
        await runSnapshotList(defaultArgs)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(3)
    })
  })

  describe("sandbox", () => {
    it("--disable-commands page.snapshot.list は exit 7 になる", async () => {
      try {
        await runSnapshotList({
          ...defaultArgs,
          "enable-commands": undefined,
          "disable-commands": "page.snapshot.list",
        })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(7)
    })
  })
})
