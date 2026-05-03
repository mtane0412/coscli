/**
 * serve.test.ts — `cos serve --rest` コマンドのテスト。
 *
 * DI (deps) で startServer・getSid をモック注入し、
 * バリデーション・終了コード・起動メッセージを検証する。
 * Bun.serve の実起動は tests/integration/serve.smoke.test.ts で別途検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { type ServeDeps, makeServeCommand } from "@/commands/serve"

// ----- デフォルト引数 -----

const defaultArgs = {
  rest: true,
  port: "8080",
  host: "127.0.0.1",
  token: undefined,
  "allow-write": false,
  project: "テストプロジェクト",
  profile: undefined,
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

// ----- セットアップ -----

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
const writtenChunks: string[] = []
const stderrChunks: string[] = []

beforeEach(() => {
  writtenChunks.length = 0
  stderrChunks.length = 0
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writtenChunks.push(String(chunk))
    return true
  })
  stderrMock = spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderrChunks.push(String(chunk))
    return true
  })
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
})

/** runServe は makeServeCommand の run を呼び出すヘルパー。 */
async function runServe(args: Record<string, unknown>, deps?: ServeDeps): Promise<void> {
  const cmd = makeServeCommand(deps)
  await (cmd.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

/** 即座に resolve する startServer モック。 */
const immediateStartServer: ServeDeps["startServer"] = async () => {}

/** 常に "テストSID" を返す getSid モック。 */
const mockGetSid: ServeDeps["getSid"] = async () => "テストSID"

/** ScrapboxWriter のスタブ実装。 */
const stubWriter: import("@/core/api/ws").ScrapboxWriter = {
  patch: async () => ({ commitId: "test", pageId: "test" }),
  insertLines: async () => ({ commitId: "test" }),
  deletePage: async () => ({ title: "test" }),
  pinPage: async () => ({ title: "test" }),
  unpinPage: async () => ({ title: "test" }),
}

/** 即座に stubWriter を返す createWriter モック。 */
const mockCreateWriter: ServeDeps["createWriter"] = async () => stubWriter

describe("makeServeCommand", () => {
  describe("バリデーション", () => {
    it("--rest 未指定の場合は exit 5 で終了する", async () => {
      try {
        await runServe(
          { ...defaultArgs, rest: false },
          { getSid: mockGetSid, createWriter: mockCreateWriter, startServer: immediateStartServer },
        )
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
      try {
        await runServe(
          { ...defaultArgs, project: undefined },
          { getSid: mockGetSid, createWriter: mockCreateWriter, startServer: immediateStartServer },
        )
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--port=0 は範囲外のため exit 5 で終了する", async () => {
      try {
        await runServe(
          { ...defaultArgs, port: "0" },
          { getSid: mockGetSid, createWriter: mockCreateWriter, startServer: immediateStartServer },
        )
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--port=65536 は範囲外のため exit 5 で終了する", async () => {
      try {
        await runServe(
          { ...defaultArgs, port: "65536" },
          { getSid: mockGetSid, createWriter: mockCreateWriter, startServer: immediateStartServer },
        )
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--port=abc は数値でないため exit 5 で終了する", async () => {
      try {
        await runServe(
          { ...defaultArgs, port: "abc" },
          { getSid: mockGetSid, createWriter: mockCreateWriter, startServer: immediateStartServer },
        )
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("sandbox", () => {
    it("serve.rest が disable-commands に含まれている場合は exit 7 で終了する", async () => {
      try {
        await runServe(
          { ...defaultArgs, "disable-commands": "serve.rest" },
          { getSid: mockGetSid, createWriter: mockCreateWriter, startServer: immediateStartServer },
        )
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(7)
    })
  })

  describe("認証エラー", () => {
    it("sid 取得失敗（未ログイン）の場合は exit 2 で終了する", async () => {
      try {
        await runServe(defaultArgs, {
          getSid: async () => {
            process.exit(2)
            throw new Error("unreachable")
          },
          createWriter: mockCreateWriter,
          startServer: immediateStartServer,
        })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(2)
    })
  })

  describe("正常起動", () => {
    it("startServer が呼ばれる", async () => {
      let called = false
      try {
        await runServe(defaultArgs, {
          getSid: mockGetSid,
          createWriter: mockCreateWriter,
          startServer: async () => {
            called = true
          },
        })
      } catch {
        // 想定内
      }
      expect(called).toBe(true)
    })

    it("--json 指定時に起動 envelope を stdout に出力する", async () => {
      try {
        await runServe(
          { ...defaultArgs, json: true },
          { getSid: mockGetSid, createWriter: mockCreateWriter, startServer: immediateStartServer },
        )
      } catch {
        // 想定内
      }
      const output = writtenChunks.join("")
      expect(output).toContain('"port"')
      expect(output).toContain("8080")
    })

    it("--json なし時に起動メッセージを stderr に出力する", async () => {
      try {
        await runServe(defaultArgs, {
          getSid: mockGetSid,
          createWriter: mockCreateWriter,
          startServer: immediateStartServer,
        })
      } catch {
        // 想定内
      }
      const output = stderrChunks.join("")
      expect(output).toContain("8080")
    })
  })
})
