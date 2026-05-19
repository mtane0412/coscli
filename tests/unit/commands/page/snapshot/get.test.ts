/**
 * page/snapshot/get.test.ts — `cos page snapshot get <title> <timestampId>` コマンドのテスト。
 *
 * - 正常系: スナップショット詳細が JSON で取れる
 * - getPage が呼ばれて pageId と timestampId が getPageSnapshot に渡ること
 * - --text でスナップショット本文 (lines[].text) のみが改行区切りで出力される
 * - --plain でメタ情報 + 本文が出力される
 * - --text と --plain の同時指定は VALIDATION_ERROR (exit 5)
 * - title 空 / timestampId 空 → VALIDATION_ERROR (exit 5)
 * - project 未指定 → exit 5
 * - 認証エラー → exit 2
 * - 404 (ページ未存在) → exit 4
 * - 403 (権限なし) → exit 3
 * - sandbox 違反 → exit 7
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageSnapshotGetCommand } from "@/commands/page/snapshot/get"
import { AuthError, ForbiddenError, NotFoundError } from "@/core/api/rest"
import * as pages from "@/core/pages"
import type { Page } from "@/schemas/page"
import type { PageSnapshotResult } from "@/schemas/snapshot"
import pageDetailFixture from "../../../../fixtures/page-detail.json"
import pageSnapshotResultFixture from "../../../../fixtures/snapshots/page-snapshot-result.json"

/** コマンド run ヘルパー */
async function runSnapshotGet(args: Record<string, unknown>) {
  await (
    pageSnapshotGetCommand.run as (ctx: {
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
  timestampId: "1700000000-snap2",
  json: true,
  plain: false,
  text: false,
  "results-only": false,
  quiet: false,
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let getPageSpy: ReturnType<typeof spyOn>
let getPageSnapshotSpy: ReturnType<typeof spyOn>

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

  // getPageSnapshot のモック
  getPageSnapshotSpy = spyOn(pages, "getPageSnapshot").mockResolvedValue(
    pageSnapshotResultFixture as PageSnapshotResult,
  )
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  getPageSpy.mockRestore()
  getPageSnapshotSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageSnapshotGetCommand", () => {
  describe("正常系", () => {
    it("--json でスナップショット詳細が { page, snapshot } envelope で出力される", async () => {
      try {
        await runSnapshotGet(defaultArgs)
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      expect(stdoutMock).toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.page.title).toBe("Hello World")
      expect(parsed.data.snapshot.title).toBe("Hello World")
      expect(parsed.data.snapshot.lines).toHaveLength(3)
    })

    it("getPage → getPageSnapshot の順で pageId と timestampId が渡ること", async () => {
      try {
        await runSnapshotGet(defaultArgs)
      } catch {
        // 想定内
      }

      expect(getPageSpy).toHaveBeenCalledTimes(1)
      const getPageOpts = getPageSpy.mock.calls[0]?.[1] as { project: string; title: string }
      expect(getPageOpts.title).toBe("Hello World")

      expect(getPageSnapshotSpy).toHaveBeenCalledTimes(1)
      const snapshotOpts = getPageSnapshotSpy.mock.calls[0]?.[1] as {
        project: string
        pageId: string
        timestampId: string
      }
      expect(snapshotOpts.pageId).toBe(pageDetailFixture.id)
      expect(snapshotOpts.timestampId).toBe("1700000000-snap2")
    })

    it("--text でスナップショット本文 (lines[].text) のみが改行区切りで出力される", async () => {
      try {
        await runSnapshotGet({ ...defaultArgs, json: false, plain: false, text: true })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const writtenLines = stdoutMock.mock.calls.map((c: unknown[]) => c[0] as string)
      // snapshot.lines は 3 件
      expect(writtenLines).toHaveLength(3)
      expect(writtenLines[0]).toBe("Hello World\n")
      expect(writtenLines[1]).toBe("最初の行のスナップショット内容\n")
      expect(writtenLines[2]).toBe("2行目のスナップショット内容\n")
    })

    it("--plain でページタイトルと作成日時と本文が出力される", async () => {
      try {
        await runSnapshotGet({ ...defaultArgs, json: false, plain: true, text: false })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const writtenLines = stdoutMock.mock.calls.map((c: unknown[]) => c[0] as string)
      const allOutput = writtenLines.join("")
      // タイトルが含まれること
      expect(allOutput).toContain("Hello World")
      // 本文の行が含まれること
      expect(allOutput).toContain("最初の行のスナップショット内容")
    })
  })

  describe("バリデーションエラー", () => {
    it("project 未指定は VALIDATION_ERROR (exit 5) になる", async () => {
      try {
        await runSnapshotGet({ ...defaultArgs, project: undefined })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("title が空文字は VALIDATION_ERROR (exit 5) になる", async () => {
      try {
        await runSnapshotGet({ ...defaultArgs, title: "" })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("timestampId が空文字は VALIDATION_ERROR (exit 5) になる", async () => {
      try {
        await runSnapshotGet({ ...defaultArgs, timestampId: "" })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--text と --plain の同時指定は VALIDATION_ERROR (exit 5) になる", async () => {
      try {
        await runSnapshotGet({ ...defaultArgs, json: false, plain: true, text: true })
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
        await runSnapshotGet(defaultArgs)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(2)
    })

    it("NotFoundError は exit 4 になる", async () => {
      getPageSpy.mockRejectedValue(new NotFoundError("テストページ"))
      try {
        await runSnapshotGet(defaultArgs)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(4)
    })

    it("ForbiddenError は exit 3 になる", async () => {
      getPageSpy.mockRejectedValue(new ForbiddenError())
      try {
        await runSnapshotGet(defaultArgs)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(3)
    })
  })

  describe("sandbox", () => {
    it("--disable-commands page.snapshot.get は exit 7 になる", async () => {
      try {
        await runSnapshotGet({
          ...defaultArgs,
          "enable-commands": undefined,
          "disable-commands": "page.snapshot.get",
        })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(7)
    })
  })
})
