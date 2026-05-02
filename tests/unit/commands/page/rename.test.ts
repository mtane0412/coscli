/**
 * page/rename.test.ts — `cos page rename <title> <new-title>` コマンドのテスト。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageRenameCommand } from "@/commands/page/rename"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runRename(args: Record<string, unknown>) {
  await (
    pageRenameCommand.run as (ctx: {
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
  process.env["COS_PROJECT"] = undefined
  process.env["COS_ENABLE_COMMANDS"] = undefined
  process.env["COS_DISABLE_COMMANDS"] = undefined
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

describe("pageRenameCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runRename({
        title: "旧タイトル",
        "new-title": "新タイトル",
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })
})
