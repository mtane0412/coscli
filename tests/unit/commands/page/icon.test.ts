/**
 * page/icon.test.ts — `cos page icon <title>` コマンドのテスト。
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { pageIconCommand } from "@/commands/page/icon"

// process.exit をモック化してテスト終了を防ぐ
let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runIcon(args: Record<string, unknown>) {
  await (
    pageIconCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
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

describe("pageIconCommand", () => {
  it("アイコン URL を stdout に出力する", async () => {
    process.env["COS_PROJECT"] = "テストプロジェクト"

    await runIcon({
      title: "テストページ",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })

    expect(stdoutMock).toHaveBeenCalledWith(
      "https://scrapbox.io/api/pages/%E3%83%86%E3%82%B9%E3%83%88%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88/%E3%83%86%E3%82%B9%E3%83%88%E3%83%9A%E3%83%BC%E3%82%B8/icon\n",
    )
  })

  it("--json フラグ指定時は JSON に url フィールドを含む", async () => {
    const writeJsonSpy = mock(() => {})
    process.env["COS_PROJECT"] = "myproject"

    const consoleSpy = spyOn(process.stdout, "write").mockImplementation(() => true)
    await runIcon({
      title: "MyPage",
      project: "myproject",
      json: true,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })
    // JSON 出力は stdout に書かれる
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("icon"))
    writeJsonSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    // process.exit がモックされているため実行が継続し buildIconUrl で throw される場合がある
    try {
      await runIcon({
        title: "テストページ",
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後に継続するため throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })
})
