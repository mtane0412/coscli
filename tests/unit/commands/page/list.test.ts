/**
 * page/list.test.ts — `cos page list` コマンドのテスト。
 *
 * --limit / --skip に無効値を渡した場合の VALIDATION_ERROR (exit 5) と、
 * 有効値を渡した場合に正常動作することを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { pageListCommand } from "@/commands/page/list"
import pageListFixture from "../../../fixtures/page-list.json"

/** listPages に渡された opts をキャプチャする */
const capturedListPagesCalls: { limit?: number; skip?: number }[] = []

// Bun は mock.module をファイル先頭にホイストするため import より前に評価される
mock.module("@/core/pages", () => ({
  listPages: mock(
    async (
      _client: unknown,
      opts: { project: string; limit?: number; skip?: number; sort?: string },
    ) => {
      // exactOptionalPropertyTypes: true のためオプショナルプロパティへは条件付き代入を使う
      const captured: { limit?: number; skip?: number } = {}
      if (opts.limit !== undefined) captured.limit = opts.limit
      if (opts.skip !== undefined) captured.skip = opts.skip
      capturedListPagesCalls.push(captured)
      return pageListFixture
    },
  ),
}))

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runList(args: Record<string, unknown>) {
  await (
    pageListCommand.run as (ctx: {
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
  // buildRestClient がキーチェーン呼び出しをスキップできるようダミー SID を設定する
  process.env["COS_SID"] = "s%3Atest-session-id"
  // 各テスト前にキャプチャを初期化する
  capturedListPagesCalls.length = 0
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageListCommand", () => {
  describe("--limit のバリデーション", () => {
    it("--limit -1 (負数) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "-1",
          skip: undefined,
          sort: undefined,
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("-1"))
    })

    it("--limit 0 (ゼロ) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "0",
          skip: undefined,
          sort: undefined,
          json: true,
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

    it("--limit abc (文字列) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "abc",
          skip: undefined,
          sort: undefined,
          json: true,
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

    it("--limit 1.5 (小数) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "1.5",
          skip: undefined,
          sort: undefined,
          json: true,
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

    it("--limit 1e3 (指数表記) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "1e3",
          skip: undefined,
          sort: undefined,
          json: true,
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

    it("--limit 0x10 (16進数) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "0x10",
          skip: undefined,
          sort: undefined,
          json: true,
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

    it("--limit 1 (最小有効値) は正常動作し API が呼び出される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "1",
          skip: undefined,
          sort: undefined,
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      // exitMock が呼ばれていない = VALIDATION_ERROR ではない
      expect(exitMock).not.toHaveBeenCalled()
      // listPages が limit=1 で呼び出されている
      expect(capturedListPagesCalls).toHaveLength(1)
      expect(capturedListPagesCalls[0]?.limit).toBe(1)
    })

    it("--limit 100 (通常の有効値) は正常動作し API が呼び出される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "100",
          skip: undefined,
          sort: undefined,
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      expect(capturedListPagesCalls).toHaveLength(1)
      expect(capturedListPagesCalls[0]?.limit).toBe(100)
    })
  })

  describe("--skip のバリデーション", () => {
    it("--skip -1 (負数) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: "-1",
          sort: undefined,
          json: true,
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

    it("--skip abc (文字列) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: "abc",
          sort: undefined,
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("abc"))
    })

    it("--skip 1.5 (小数) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: "1.5",
          sort: undefined,
          json: true,
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

    it("--skip 0 (ゼロ) は有効値として正常動作し API が呼び出される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: "0",
          sort: undefined,
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      // skip=0 はスキップなしとして有効なので exit しない
      expect(exitMock).not.toHaveBeenCalled()
      expect(capturedListPagesCalls).toHaveLength(1)
      expect(capturedListPagesCalls[0]?.skip).toBe(0)
    })
  })
})
