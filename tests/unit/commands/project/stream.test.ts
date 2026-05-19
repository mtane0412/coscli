/**
 * project/stream.test.ts — `cos project stream` コマンドのテスト。
 *
 * DI (deps) を使って REST クライアントをモック注入し、
 * snapshot モード・watch モード・エラー系・バリデーションを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import {
  type ProjectStreamDeps,
  type ProjectStreamRestClient,
  makeProjectStreamCommand,
} from "@/commands/project/stream"
import { AuthError, ForbiddenError, NotFoundError, RateLimitError } from "@/core/api/rest"
import type { StreamResponse } from "@/schemas/stream"

// ----- モックデータ -----

/** 基本 StreamResponse (snapshot 用) */
const mockStreamResponse: StreamResponse = {
  projectName: "テストプロジェクト",
  end: 1700000000,
  pages: [
    { id: "ページID-001", title: "テストページ1", updated: 1700000000, created: 1699900000 },
    { id: "ページID-002", title: "テストページ2", updated: 1699950000, created: 1699800000 },
  ],
  events: [
    {
      id: "イベントID-001",
      pageId: "ページID-001",
      userId: "ユーザーID-001",
      projectId: "プロジェクトID-001",
      created: 1700000001,
      updated: 1700000001,
      type: "page.delete",
      data: { titleLc: "テストページ1" },
    },
    {
      id: "イベントID-002",
      pageId: "ページID-002",
      userId: "ユーザーID-002",
      projectId: "プロジェクトID-001",
      created: 1699990001,
      updated: 1699990001,
      type: "member.join",
    },
  ],
}

// ----- モックファクトリ -----

/** createMockRestClient はモック REST クライアントを生成する。 */
function createMockRestClient(
  responses: StreamResponse[] | (() => StreamResponse) = [mockStreamResponse],
  opts: { throwError?: Error } = {},
): ProjectStreamRestClient {
  let callCount = 0
  return {
    async getProjectStream() {
      if (opts.throwError) throw opts.throwError
      if (typeof responses === "function") return responses()
      const response = responses[callCount] ?? responses[responses.length - 1]
      callCount++
      return response as StreamResponse
    },
  }
}

/**
 * createImmediateSleep は即座に resolve する sleep モックを返す。
 * watch モードのポーリング間隔を待機なしで実行できる。
 */
function createImmediateSleep(): (ms: number, signal: AbortSignal) => Promise<void> {
  return async (_ms, signal) => {
    if (signal.aborted) return
    // マクロタスクを 1 つ挟んで非同期にする (abort チェックのため)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

/**
 * createWatchSleep は n 回目の sleep 呼び出しで SIGINT を発行する sleep モックを返す。
 *
 * コマンド内部の AbortController は外部から直接 abort できないため、
 * SIGINT 経由でコマンドの sigintHandler を呼び出し、ループを終了させる。
 * n 回目未満の呼び出しは即 resolve する。
 */
function createWatchSleep(
  sigintAfterCalls = 1,
): (ms: number, signal: AbortSignal) => Promise<void> {
  let callCount = 0
  return async (_ms, signal) => {
    callCount++
    if (signal.aborted) return
    if (callCount >= sigintAfterCalls) {
      // SIGINT を発行してコマンド内部の sigintHandler を呼び出す
      process.emit("SIGINT", "SIGINT")
      // abort signal が立つまで待つ
      return new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve()
          return
        }
        signal.addEventListener("abort", () => resolve(), { once: true })
      })
    }
    // まだ n 回目に達していないなら即 resolve して次の fetch へ
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

/** defaultArgs は全テストで共通の基本引数。 */
const defaultArgs: Record<string, unknown> = {
  name: "テストプロジェクト",
  project: undefined,
  limit: undefined,
  watch: false,
  interval: "30",
  timeout: "0",
  json: false,
  plain: false,
  "results-only": false,
  select: undefined,
  "enable-commands": undefined,
  "disable-commands": undefined,
  verbose: undefined,
  quiet: false,
  profile: undefined,
}

/** createMockDeps はモック依存を生成する。個別フィールドを上書き可能。 */
function createMockDeps(overrides: Partial<ProjectStreamDeps> = {}): ProjectStreamDeps {
  return {
    getSid: async () => "テストSID",
    restClient: createMockRestClient(),
    sleep: createImmediateSleep(),
    ...overrides,
  }
}

/** runStream は makeProjectStreamCommand の run を呼び出すヘルパー。 */
async function runStream(args: Record<string, unknown>, deps?: ProjectStreamDeps): Promise<void> {
  const cmd = makeProjectStreamCommand(deps)
  await (cmd.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

/** process.exit のモック後に継続実行で throw される例外を握り潰してコマンドを実行する */
async function runAndIgnoreExit(
  args: Record<string, unknown>,
  deps?: ProjectStreamDeps,
): Promise<void> {
  try {
    await runStream(args, deps)
  } catch {
    // process.exit モック後の継続による throw は想定内
  }
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
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_SID")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

/** 書き出された全出力を結合して返す */
function captureStdout(): string {
  return writtenChunks.join("")
}

/** captureEventLines は stdout 出力から JSON イベント行 (error キーなし) を抽出する。 */
function captureEventLines(out: string): string[] {
  return out
    .split("\n")
    .filter((l) => l.trim())
    .filter((l) => {
      try {
        const p = JSON.parse(l) as Record<string, unknown>
        return "id" in p && !("error" in p)
      } catch {
        return false
      }
    })
}

// ----- テスト -----

describe("makeProjectStreamCommand", () => {
  describe("バリデーション", () => {
    it("プロジェクト名未指定 (name も --project も環境変数もなし) の場合は exit 5 で終了する", async () => {
      await runAndIgnoreExit(
        { ...defaultArgs, name: undefined, project: undefined },
        createMockDeps(),
      )
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--limit に負数を指定すると exit 5 で終了する", async () => {
      await runAndIgnoreExit({ ...defaultArgs, limit: "-1" }, createMockDeps())
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--limit に 0 を指定すると exit 5 で終了する", async () => {
      await runAndIgnoreExit({ ...defaultArgs, limit: "0" }, createMockDeps())
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--limit に非数値を指定すると exit 5 で終了する", async () => {
      await runAndIgnoreExit({ ...defaultArgs, limit: "abc" }, createMockDeps())
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--interval に 0 を指定すると exit 5 で終了する (レート保護: 最小 1 秒)", async () => {
      await runAndIgnoreExit({ ...defaultArgs, watch: true, interval: "0" }, createMockDeps())
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--interval に負数を指定すると exit 5 で終了する", async () => {
      await runAndIgnoreExit({ ...defaultArgs, watch: true, interval: "-5" }, createMockDeps())
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--timeout に負数を指定すると exit 5 で終了する", async () => {
      await runAndIgnoreExit({ ...defaultArgs, watch: true, timeout: "-1" }, createMockDeps())
      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("sandbox 違反", () => {
    it("--disable-commands=project.stream の場合は exit 7 で終了する", async () => {
      await runAndIgnoreExit(
        { ...defaultArgs, "disable-commands": "project.stream" },
        createMockDeps(),
      )
      expect(exitMock).toHaveBeenCalledWith(7)
    })
  })

  describe("snapshot モード (デフォルト)", () => {
    it("getProjectStream が 1 回だけ呼ばれる", async () => {
      let callCount = 0
      const deps = createMockDeps({
        restClient: {
          async getProjectStream() {
            callCount++
            return mockStreamResponse
          },
        },
      })
      await runAndIgnoreExit(defaultArgs, deps)
      expect(callCount).toBe(1)
    })

    it("--json の場合は envelope 形式で projectName/end/pages/events を含む JSON を出力する", async () => {
      await runAndIgnoreExit({ ...defaultArgs, json: true }, createMockDeps())

      const out = captureStdout()
      const parsed = JSON.parse(out) as { data: StreamResponse; meta: { command: string } }
      expect(parsed.data.projectName).toBe("テストプロジェクト")
      expect(parsed.data.end).toBe(1700000000)
      expect(Array.isArray(parsed.data.pages)).toBe(true)
      expect(Array.isArray(parsed.data.events)).toBe(true)
      expect(parsed.meta.command).toBe("project.stream")
    })

    it("--results-only の場合は data のみ出力する (meta なし)", async () => {
      await runAndIgnoreExit({ ...defaultArgs, json: true, "results-only": true }, createMockDeps())

      const out = captureStdout()
      const parsed = JSON.parse(out) as StreamResponse
      expect(parsed.projectName).toBe("テストプロジェクト")
      expect(Array.isArray(parsed.events)).toBe(true)
    })

    it("--select=events[].type の場合は event type 配列のみ出力する", async () => {
      await runAndIgnoreExit(
        { ...defaultArgs, json: true, "results-only": true, select: "events[].type" },
        createMockDeps(),
      )

      const out = captureStdout()
      const parsed = JSON.parse(out) as string[]
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toContain("page.delete")
      expect(parsed).toContain("member.join")
    })

    it("--plain の場合は TSV 形式で出力する", async () => {
      await runAndIgnoreExit({ ...defaultArgs, plain: true }, createMockDeps())

      const out = captureStdout()
      // TSV なのでタブ区切りの行が含まれる
      expect(out).toContain("\t")
    })

    it("NotFoundError の場合は exit 4 で終了する", async () => {
      const deps = createMockDeps({
        restClient: createMockRestClient([], {
          throwError: new NotFoundError("/api/stream/存在しないプロジェクト/"),
        }),
      })
      await runAndIgnoreExit(defaultArgs, deps)
      expect(exitMock).toHaveBeenCalledWith(4)
    })

    it("AuthError の場合は exit 2 で終了する", async () => {
      const deps = createMockDeps({
        restClient: createMockRestClient([], { throwError: new AuthError() }),
      })
      await runAndIgnoreExit(defaultArgs, deps)
      expect(exitMock).toHaveBeenCalledWith(2)
    })

    it("ForbiddenError の場合は exit 3 で終了する", async () => {
      const deps = createMockDeps({
        restClient: createMockRestClient([], { throwError: new ForbiddenError() }),
      })
      await runAndIgnoreExit(defaultArgs, deps)
      expect(exitMock).toHaveBeenCalledWith(3)
    })
  })

  describe("watch モード", () => {
    it("初回呼び出しはベースライン化のみで stdout に何も出力しない", async () => {
      // 1 回目の fetch 後 (ベースライン化) に sleep で SIGINT を発行して終了する
      await runAndIgnoreExit(
        { ...defaultArgs, watch: true, interval: "1", timeout: "0" },
        createMockDeps({
          sleep: createWatchSleep(1),
        }),
      )

      // イベントの NDJSON 行は 0 件 (ベースライン化のみ)
      expect(captureEventLines(captureStdout())).toHaveLength(0)
    })

    it("2 回目に新規イベントが追加されると NDJSON で出力する", async () => {
      // 1 回目: ベースラインのイベント (updated=1700000001)
      // 2 回目: 新規イベント (updated=1700100000) が追加されている
      const newEvent = {
        id: "イベントID-新規",
        pageId: "ページID-新規",
        userId: "ユーザーID-001",
        projectId: "プロジェクトID-001",
        created: 1700100000,
        updated: 1700100000,
        type: "member.join" as const,
      }
      const secondResponse: StreamResponse = {
        ...mockStreamResponse,
        events: [newEvent, ...mockStreamResponse.events],
      }

      await runAndIgnoreExit(
        { ...defaultArgs, watch: true, interval: "1", timeout: "0" },
        createMockDeps({
          restClient: createMockRestClient([mockStreamResponse, secondResponse]),
          // 2 回目の sleep で SIGINT を発行してループを終了させる
          sleep: createWatchSleep(2),
        }),
      )

      const eventLines = captureEventLines(captureStdout())
      expect(eventLines.length).toBeGreaterThanOrEqual(1)
      const parsed = JSON.parse(eventLines[0] ?? "null") as { id: string; type: string }
      // 新規イベント 1 件が NDJSON で出力されていることを確認
      expect(parsed.id).toBe("イベントID-新規")
    })

    it("同じ id のイベントが 2 回目にも含まれていても 1 度しか出力しない (重複排除)", async () => {
      // 1 回目と 2 回目で同じ events を返す (新しい updated のイベントなし)
      await runAndIgnoreExit(
        { ...defaultArgs, watch: true, interval: "1", timeout: "0" },
        createMockDeps({
          restClient: createMockRestClient([mockStreamResponse, mockStreamResponse]),
          sleep: createWatchSleep(2),
        }),
      )

      // 2 周しても既存イベントは出力されない (ベースライン確立後の重複排除)
      expect(captureEventLines(captureStdout())).toHaveLength(0)
    })

    it("複数の新規イベントが updated 昇順で出力される", async () => {
      // 2 回目: updated が降順混在で返る新規イベント (event1=最新, event3=中, event2=最古)
      const event1: (typeof mockStreamResponse.events)[0] = {
        id: "イベントID-A",
        pageId: "ページID-A",
        userId: "ユーザーID-001",
        projectId: "プロジェクトID-001",
        created: 1700200000,
        updated: 1700200000,
        type: "member.join",
      }
      const event2: (typeof mockStreamResponse.events)[0] = {
        id: "イベントID-B",
        pageId: "ページID-B",
        userId: "ユーザーID-002",
        projectId: "プロジェクトID-001",
        created: 1700100000,
        updated: 1700100000,
        type: "member.add",
      }
      const event3: (typeof mockStreamResponse.events)[0] = {
        id: "イベントID-C",
        pageId: "ページID-C",
        userId: "ユーザーID-003",
        projectId: "プロジェクトID-001",
        created: 1700150000,
        updated: 1700150000,
        type: "invitation.reset",
      }
      // API が降順混在で返す想定 (event1=新しい, event3, event2=古い)
      const secondResponse: StreamResponse = {
        ...mockStreamResponse,
        events: [event1, event3, event2, ...mockStreamResponse.events],
      }

      await runAndIgnoreExit(
        { ...defaultArgs, watch: true, interval: "1", timeout: "0" },
        createMockDeps({
          restClient: createMockRestClient([mockStreamResponse, secondResponse]),
          sleep: createWatchSleep(2),
        }),
      )

      const eventLines = captureEventLines(captureStdout())
      expect(eventLines.length).toBeGreaterThanOrEqual(3)
      const parsedEvents = eventLines.map((l) => JSON.parse(l) as { id: string; updated: number })
      // updated 昇順になっていることを確認 (event2 → event3 → event1)
      for (let i = 1; i < parsedEvents.length; i++) {
        expect((parsedEvents[i]?.updated ?? 0) >= (parsedEvents[i - 1]?.updated ?? 0)).toBe(true)
      }
    })

    it("SIGINT を受け取ると exit 0 で終了する", async () => {
      // sleep 中に SIGINT を発生させるシナリオ
      const deps = createMockDeps({
        sleep: async (_ms, signal) => {
          if (signal.aborted) return
          // abort されるまで待機 (SIGINT で abort される)
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 200)
            signal.addEventListener("abort", () => {
              clearTimeout(timer)
              resolve()
            })
          })
        },
      })

      const promise = runAndIgnoreExit(
        { ...defaultArgs, watch: true, interval: "30", timeout: "0" },
        deps,
      )

      // 1 回目の fetch (ベースライン) が終わり sleep に入るのを待ってから SIGINT
      await new Promise((r) => setTimeout(r, 20))
      process.emit("SIGINT", "SIGINT")

      await promise
      expect(exitMock).toHaveBeenCalledWith(0)
    })

    it("--timeout で指定した秒数後に exit 124 で終了する", async () => {
      const deps = createMockDeps({
        sleep: async (_ms, signal) => {
          if (signal.aborted) return
          // 十分長い時間待機 (timeout=0.05 秒で abort される)
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000)
            signal.addEventListener("abort", () => {
              clearTimeout(timer)
              resolve()
            })
          })
        },
      })

      await runAndIgnoreExit({ ...defaultArgs, watch: true, interval: "1", timeout: "0.05" }, deps)
      expect(exitMock).toHaveBeenCalledWith(124)
    })

    it("RateLimitError の場合は警告を出力して次サイクルまで継続する", async () => {
      // 1 回目: RateLimitError → sleep (1回目) → 2 回目: 正常取得 → sleep (2回目) で SIGINT
      let callCount = 0
      const restClient: ProjectStreamRestClient = {
        async getProjectStream() {
          callCount++
          if (callCount === 1) throw new RateLimitError()
          return mockStreamResponse
        },
      }

      await runAndIgnoreExit(
        { ...defaultArgs, watch: true, interval: "1", timeout: "0" },
        createMockDeps({
          restClient,
          sleep: createWatchSleep(2),
        }),
      )

      // 2 回目まで実行されていること (exit 2/3/4 では終了していないこと)
      expect(callCount).toBeGreaterThanOrEqual(2)
      expect(exitMock).not.toHaveBeenCalledWith(2)
      expect(exitMock).not.toHaveBeenCalledWith(3)
      expect(exitMock).not.toHaveBeenCalledWith(4)
    })

    it("AuthError の場合は即 exit 2 で終了する (継続しない)", async () => {
      let callCount = 0
      const restClient: ProjectStreamRestClient = {
        async getProjectStream() {
          callCount++
          throw new AuthError()
        },
      }

      await runAndIgnoreExit(
        { ...defaultArgs, watch: true, interval: "1", timeout: "0" },
        createMockDeps({ restClient }),
      )

      // 1 回しか呼ばれていない (継続しない)
      expect(callCount).toBe(1)
      expect(exitMock).toHaveBeenCalledWith(2)
    })
  })
})
