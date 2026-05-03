/**
 * page/watch.test.ts — `cos page watch <title>` コマンドのテスト。
 *
 * DI (deps) を使って REST クライアント・subscriber をモック注入し、
 * 各フォーマット出力・終了コード・バリデーションを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { type WatchDeps, makePageWatchCommand } from "@/commands/page/watch"
import { NotFoundError } from "@/core/api/rest"
import type { PageCommitEvent, ScrapboxSubscriber } from "@/core/api/subscribe"
import type { Page } from "@/schemas/page"
import type { Project } from "@/schemas/project"

// ----- モックデータ -----

/** テスト用ページデータ */
const mockPage: Page = {
  id: "テストページID",
  title: "テストページ",
  commitId: "コミットID-000",
  created: 1000000000,
  updated: 1000000000,
  lines: [
    {
      id: "行ID-001",
      text: "テストページ",
      userId: "ユーザーID-001",
      created: 1000000000,
      updated: 1000000000,
    },
  ],
}

/** テスト用プロジェクトデータ */
const mockProject: Project = {
  id: "テストプロジェクトID",
  name: "テストプロジェクト",
  displayName: "テストプロジェクト表示名",
  publicVisible: false,
  created: 1000000000,
  updated: 1000000000,
}

/** テスト用 PageCommitEvent (InsertChange) */
const mockInsertEvent: PageCommitEvent = {
  commitId: "abc12345xyzw",
  parentId: "abc12344xyzw",
  pageId: "テストページID",
  projectId: "テストプロジェクトID",
  userId: "テストユーザーID",
  changes: [{ _insert: "_end", lines: { id: "行ID-002", text: "新しい行テキスト" } }],
  receivedAt: "2024-01-01T00:00:00.000Z",
}

/** テスト用 PageCommitEvent (DeletePageChange) */
const mockDeletePageEvent: PageCommitEvent = {
  commitId: "del12345xyzw",
  parentId: "abc12345xyzw",
  pageId: "テストページID",
  projectId: "テストプロジェクトID",
  userId: "テストユーザーID",
  changes: [{ deleted: true }],
  receivedAt: "2024-01-01T00:01:00.000Z",
}

// ----- モックファクトリ -----

/**
 * createMockSubscriberFactory はモック ScrapboxSubscriber を返すファクトリを生成する。
 *
 * events を順に onCommit に渡した後、holdUntilAbort=true なら abort まで待機、
 * false なら即 resolve する。
 */
function createMockSubscriberFactory(
  events: PageCommitEvent[] = [],
  opts: { holdUntilAbort?: boolean } = {},
): () => Promise<ScrapboxSubscriber> {
  return async () => ({
    subscribePage(subscribeOpts, onCommit) {
      for (const event of events) {
        onCommit(event)
      }
      if (opts.holdUntilAbort) {
        return new Promise<void>((resolve) => {
          if (subscribeOpts.signal.aborted) {
            resolve()
            return
          }
          subscribeOpts.signal.addEventListener("abort", () => resolve(), { once: true })
        })
      }
      return Promise.resolve()
    },
  })
}

/** defaultArgs は全テストで共通の基本引数。 */
const defaultArgs: Record<string, unknown> = {
  title: "テストページ",
  project: "テストプロジェクト",
  timeout: 0,
  format: "",
  json: false,
  plain: false,
  "results-only": false,
  select: undefined,
  "dry-run": false,
  "enable-commands": undefined,
  "disable-commands": undefined,
  verbose: undefined,
  quiet: false,
}

/** createMockDeps はモック依存を生成する。個別フィールドを上書き可能。 */
function createMockDeps(overrides: Partial<WatchDeps> = {}): WatchDeps {
  return {
    getSid: async () => "テストSID",
    restClient: {
      getPage: async () => mockPage,
      getProject: async () => mockProject,
    },
    createSubscriber: createMockSubscriberFactory(),
    ...overrides,
  }
}

/** runWatch は makePageWatchCommand の run を呼び出すヘルパー。 */
async function runWatch(args: Record<string, unknown>, deps?: WatchDeps): Promise<void> {
  const cmd = makePageWatchCommand(deps)
  await (cmd.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

// ----- セットアップ -----

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
const writtenChunks: string[] = []

beforeEach(() => {
  writtenChunks.length = 0
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writtenChunks.push(String(chunk))
    return true
  })
  process.env["COS_PROJECT"] = undefined
  process.env["COS_ENABLE_COMMANDS"] = undefined
  process.env["COS_DISABLE_COMMANDS"] = undefined
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

// ----- テスト -----

describe("makePageWatchCommand", () => {
  describe("バリデーション", () => {
    it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
      try {
        await runWatch({ ...defaultArgs, project: undefined }, createMockDeps())
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--dry-run 指定時は exit 5 で終了する (page.watch は --dry-run 非対応)", async () => {
      try {
        await runWatch({ ...defaultArgs, "dry-run": true }, createMockDeps())
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("未対応の --format を指定すると exit 5 で終了する", async () => {
      try {
        await runWatch({ ...defaultArgs, format: "json-pretty" }, createMockDeps())
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--timeout に負数を指定すると exit 5 で終了する", async () => {
      try {
        await runWatch({ ...defaultArgs, timeout: -1 }, createMockDeps())
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("sandbox 違反", () => {
    it("sandbox 違反の場合は exit 7 で終了する", async () => {
      try {
        await runWatch({ ...defaultArgs, "disable-commands": "page.watch" }, createMockDeps())
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(7)
    })
  })

  describe("認証・REST エラー", () => {
    it("sid が取得できない場合は exit 2 で終了する", async () => {
      const deps = createMockDeps({
        getSid: async () => {
          process.exit(2)
          return "" as never
        },
      })
      try {
        await runWatch(defaultArgs, deps)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(2)
    })

    it("getPage で NotFoundError が発生した場合は exit 4 で終了する", async () => {
      const deps = createMockDeps({
        restClient: {
          getPage: async () => {
            throw new NotFoundError("/api/pages/テストプロジェクト/テストページ")
          },
          getProject: async () => mockProject,
        },
      })
      try {
        await runWatch(defaultArgs, deps)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(4)
    })
  })

  describe("出力フォーマット", () => {
    it("--json が指定された場合は commit イベントを NDJSON で出力する", async () => {
      const deps = createMockDeps({
        createSubscriber: createMockSubscriberFactory([mockInsertEvent]),
      })
      await runWatch({ ...defaultArgs, json: true }, deps)

      const output = writtenChunks.join("")
      // 改行区切り 1 行の JSON
      const lines = output.trim().split("\n")
      expect(lines.length).toBeGreaterThanOrEqual(1)
      const parsed = JSON.parse(lines[0] ?? "null") as { commitId: string }
      expect(parsed.commitId).toBe("abc12345xyzw")
    })

    it("デフォルト形式で InsertChange を '+' 記号で出力する", async () => {
      const deps = createMockDeps({
        createSubscriber: createMockSubscriberFactory([mockInsertEvent]),
      })
      await runWatch(defaultArgs, deps)

      const output = writtenChunks.join("")
      // commitId 先頭 8 文字のヘッダが含まれること
      expect(output).toContain("abc12345")
      // InsertChange は '+ <text>' 形式
      expect(output).toContain("+ 新しい行テキスト")
    })

    it("--format=diff の場合は unified diff ヘッダを付与して出力する", async () => {
      const deps = createMockDeps({
        createSubscriber: createMockSubscriberFactory([mockInsertEvent]),
      })
      await runWatch({ ...defaultArgs, format: "diff" }, deps)

      const output = writtenChunks.join("")
      // diff ヘッダが含まれること
      expect(output).toContain("--- a/テストページ")
      expect(output).toContain("+++ b/テストページ")
      // InsertChange は '+ <text>' 形式
      expect(output).toContain("+ 新しい行テキスト")
    })

    it("--json と --format=diff を同時指定すると --json を優先する", async () => {
      const deps = createMockDeps({
        createSubscriber: createMockSubscriberFactory([mockInsertEvent]),
      })
      await runWatch({ ...defaultArgs, json: true, format: "diff" }, deps)

      const output = writtenChunks.join("")
      // JSON Lines 出力: diff ヘッダが含まれないこと
      expect(output).not.toContain("--- a/")
      // JSON が含まれること
      const lines = output.trim().split("\n")
      const parsed = JSON.parse(lines[0] ?? "null") as { commitId: string }
      expect(parsed.commitId).toBe("abc12345xyzw")
    })

    it("DeletePageChange を受け取ると '! page deleted' を出力して exit 0 で終了する", async () => {
      const deps = createMockDeps({
        createSubscriber: createMockSubscriberFactory([mockDeletePageEvent]),
      })
      await runWatch(defaultArgs, deps)

      const output = writtenChunks.join("")
      expect(output).toContain("! page deleted")
      expect(exitMock).toHaveBeenCalledWith(0)
    })
  })

  describe("ライフサイクル", () => {
    it("SIGINT を受け取ると exit 0 で終了する", async () => {
      // holdUntilAbort にして subscribe 中に SIGINT をシミュレートする
      const deps = createMockDeps({
        createSubscriber: createMockSubscriberFactory([], { holdUntilAbort: true }),
      })

      const promise = runWatch(defaultArgs, deps)

      // getSid/getPage/getProject/subscribePage の await が完了するまでマクロタスクを挟む
      await new Promise((r) => setTimeout(r, 0))

      // SIGINT をシミュレート
      process.emit("SIGINT", "SIGINT")

      await promise

      expect(exitMock).toHaveBeenCalledWith(0)
    })

    it("--timeout で指定した秒数後に exit 124 で終了する", async () => {
      // holdUntilAbort にして timeout が先に発火することを確認する
      const deps = createMockDeps({
        createSubscriber: createMockSubscriberFactory([], { holdUntilAbort: true }),
      })

      // timeout=0.01 (10ms) で自動終了
      await runWatch({ ...defaultArgs, timeout: 0.01 }, deps)

      expect(exitMock).toHaveBeenCalledWith(124)
    })
  })
})
