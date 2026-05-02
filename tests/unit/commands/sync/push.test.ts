/**
 * sync/push.test.ts — `cos sync push [<title>]` コマンドの入力バリデーションテスト。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { syncPushCommand } from "@/commands/sync/push"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

async function runPush(args: Record<string, unknown>) {
  await (
    syncPushCommand.run as (ctx: {
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

function defaultArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: undefined,
    all: false,
    dir: undefined,
    format: "txt",
    retries: "0",
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
  process.env["COS_PROJECT"] = undefined
  process.env["COS_ENABLE_COMMANDS"] = undefined
  process.env["COS_DISABLE_COMMANDS"] = undefined
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

describe("syncPushCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runPush(defaultArgs({ project: undefined }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("title も --all も未指定の場合は exit 5 で終了する", async () => {
    try {
      await runPush(defaultArgs({ title: undefined, all: false }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--dir も config.sync.dir も未設定の場合は exit 5 で終了する", async () => {
    try {
      await runPush(defaultArgs({ title: "テストページ", dir: undefined }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("sandbox で sync.push が禁止されている場合は exit 7 で終了する", async () => {
    try {
      await runPush(
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
