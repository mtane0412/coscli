/**
 * sync/pull.test.ts — `cos sync pull <title>` コマンドの入力バリデーションテスト。
 *
 * 実際の API コールは engine.test.ts でカバーするため、
 * このファイルでは引数バリデーション・sandbox・exit コードのみを確認する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { syncPullCommand } from "@/commands/sync/pull"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runPull(args: Record<string, unknown>) {
  await (
    syncPullCommand.run as (ctx: {
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

/** デフォルト引数 (最低限必要なフラグ) */
function defaultArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: undefined,
    all: false,
    dir: undefined,
    format: "txt",
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
    ...overrides,
  }
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

describe("syncPullCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runPull(defaultArgs({ project: undefined }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("title も --all も未指定の場合は exit 5 で終了する (TARGET_REQUIRED)", async () => {
    try {
      await runPull(defaultArgs({ title: undefined, all: false, dir: "/tmp/sync" }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--dir も config.sync.dir も未設定の場合は exit 5 で終了する", async () => {
    try {
      await runPull(defaultArgs({ title: "テストページ", dir: undefined }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--format=md は exit 5 で終了する", async () => {
    try {
      await runPull(defaultArgs({ title: "テストページ", dir: "/tmp/sync", format: "md" }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("sandbox で sync.pull が禁止されている場合は exit 7 で終了する", async () => {
    try {
      await runPull(
        defaultArgs({
          title: "テストページ",
          dir: "/tmp/sync",
          "enable-commands": "page",
        }),
      )
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})
