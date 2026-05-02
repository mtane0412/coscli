/**
 * sync/diff.test.ts — `cos sync diff [<title>]` コマンドの入力バリデーションテスト。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { syncDiffCommand } from "@/commands/sync/diff"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

async function runDiff(args: Record<string, unknown>) {
  await (
    syncDiffCommand.run as (ctx: {
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

describe("syncDiffCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runDiff(defaultArgs({ project: undefined }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("title も --all も未指定の場合は exit 5 で終了する", async () => {
    try {
      await runDiff(defaultArgs({ title: undefined, all: false }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--dir も config.sync.dir も未設定の場合は exit 5 で終了する", async () => {
    try {
      await runDiff(defaultArgs({ title: "テストページ", dir: undefined }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("sandbox で sync.diff が禁止されている場合は exit 7 で終了する", async () => {
    try {
      await runDiff(
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
