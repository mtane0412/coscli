/**
 * page/list.test.ts — `cos page list` コマンドのテスト。
 *
 * --limit / --skip に無効値を渡した場合の VALIDATION_ERROR (exit 5) と、
 * 有効値を渡した場合に正常動作することを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageListCommand } from "@/commands/page/list"
import * as pages from "@/core/pages"
import pageListFixture from "../../../fixtures/page-list.json"

/** ピン留めテスト用フィクスチャ: pin: 0 が2件 + pin > 0 が1件 */
const pinnedPageListFixture = {
  projectName: "テストプロジェクト",
  skip: 0,
  limit: 30,
  count: 3,
  pages: [
    {
      id: "page-id-hello",
      title: "Hello World",
      image: null,
      descriptions: ["最初の行", "2行目"],
      user: { id: "user-id-1" },
      pin: 0,
      views: 10,
      linked: 3,
      created: 1700000000,
      updated: 1700100000,
      accessed: 1700200000,
      snapshotCreated: null,
    },
    {
      id: "page-id-japanese",
      title: "日本語タイトル",
      image: null,
      descriptions: ["日本語の説明文"],
      user: { id: "user-id-1" },
      pin: 0,
      views: 5,
      linked: 0,
      created: 1700050000,
      updated: 1700150000,
      accessed: 1700250000,
      snapshotCreated: null,
    },
    {
      id: "page-id-pinned",
      title: "ピン留めページ",
      image: null,
      descriptions: ["ピン留めされたページの説明"],
      user: { id: "user-id-1" },
      pin: 1700000001,
      views: 20,
      linked: 5,
      created: 1700000000,
      updated: 1700100001,
      accessed: 1700200001,
      snapshotCreated: null,
    },
  ],
}

/** listPages に渡された opts をキャプチャする */
const capturedListPagesCalls: { limit?: number; skip?: number; filterValue?: string }[] = []

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let listPagesSpy: ReturnType<typeof spyOn>

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
  listPagesSpy = spyOn(pages, "listPages").mockImplementation(async (_client, opts) => {
    // exactOptionalPropertyTypes: true のためオプショナルプロパティへは条件付き代入を使う
    const captured: { limit?: number; skip?: number; filterValue?: string } = {}
    if (opts.limit !== undefined) captured.limit = opts.limit
    if (opts.skip !== undefined) captured.skip = opts.skip
    if (opts.filterValue !== undefined) captured.filterValue = opts.filterValue
    capturedListPagesCalls.push(captured)
    return pageListFixture
  })
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  listPagesSpy.mockRestore()
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

  describe("--pinned フィルタリング", () => {
    beforeEach(() => {
      // ピン留めテスト専用フィクスチャ（pin: 0 × 2件 + pin > 0 × 1件）を返すよう上書きする
      listPagesSpy.mockImplementation(
        async (
          _client: Parameters<typeof pages.listPages>[0],
          opts: Parameters<typeof pages.listPages>[1],
        ) => {
          const captured: { limit?: number; skip?: number } = {}
          if (opts.limit !== undefined) captured.limit = opts.limit
          if (opts.skip !== undefined) captured.skip = opts.skip
          capturedListPagesCalls.push(captured)
          return pinnedPageListFixture
        },
      )
    })

    it("--pinned なしのとき pin: 0 のページも含む全ページが出力される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: undefined,
          pinned: false,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      expect(output).toContain("Hello World")
      expect(output).toContain("日本語タイトル")
      expect(output).toContain("ピン留めページ")
    })

    it("--pinned ありのとき pin > 0 のページのみ出力される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: undefined,
          pinned: true,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      // pin > 0 のページのみ出力される
      expect(output).toContain("ピン留めページ")
      // pin: 0 のページは除外される
      expect(output).not.toContain("Hello World")
      expect(output).not.toContain("日本語タイトル")
    })

    it("--pinned + --limit 1 のとき pin フィルタ後に limit が適用される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "1",
          skip: undefined,
          sort: undefined,
          pinned: true,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      expect(output).toContain("ピン留めページ")
    })

    it("--pinned のとき API 呼び出しに limit が渡らない", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "5",
          skip: undefined,
          sort: undefined,
          pinned: true,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      // --pinned 時はクライアントサイドでフィルタするため API には limit を渡さない
      expect(capturedListPagesCalls).toHaveLength(1)
      expect(capturedListPagesCalls[0]?.limit).toBeUndefined()
    })

    it("--pinned + --json のとき JSON 出力の pages にピン留めページのみ含まれる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: undefined,
          pinned: true,
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      const parsed = JSON.parse(output) as { data: { pages: { title: string }[] } }
      expect(parsed.data.pages).toHaveLength(1)
      expect(parsed.data.pages[0]?.title).toBe("ピン留めページ")
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

  describe("--sort のバリデーション", () => {
    it("--sort invalid (無効な値) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: "invalid",
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
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("invalid"))
    })

    it("--sort linked (有効な値) は正常動作し API が呼び出される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: "linked",
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      expect(listPagesSpy).toHaveBeenCalled()
    })

    it("--sort updatedWithMe (有効な値) は正常動作し API が呼び出される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: "updatedWithMe",
          json: true,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      expect(listPagesSpy).toHaveBeenCalled()
    })
  })

  describe("--icon フラグ", () => {
    it("--icon mtane0412 を指定すると filterValue: 'mtane0412' が API に渡される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: undefined,
          icon: "mtane0412",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      expect(capturedListPagesCalls).toHaveLength(1)
      expect(capturedListPagesCalls[0]?.filterValue).toBe("mtane0412")
    })

    it("--icon '' (空文字) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: undefined,
          icon: "",
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

    it("--icon '   ' (空白のみ) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: undefined,
          skip: undefined,
          sort: undefined,
          icon: "   ",
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
      // バリデーションで弾かれているため API は呼ばれない
      expect(capturedListPagesCalls).toHaveLength(0)
    })

    it("--icon と --limit を同時指定した場合、filterValue と limit の両方が API に渡される", async () => {
      try {
        await runList({
          project: "テストプロジェクト",
          limit: "5",
          skip: undefined,
          sort: undefined,
          icon: "mtane0412",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // REST クライアント初期化中の throw は想定内
      }
      expect(exitMock).not.toHaveBeenCalled()
      expect(capturedListPagesCalls).toHaveLength(1)
      expect(capturedListPagesCalls[0]?.filterValue).toBe("mtane0412")
      // --icon はサーバーサイドフィルタなので limit も API に渡される
      expect(capturedListPagesCalls[0]?.limit).toBe(5)
    })
  })
})
