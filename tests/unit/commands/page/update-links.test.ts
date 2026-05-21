/**
 * page/update-links.test.ts — `cos page update-links <from> <to>` コマンドのテスト。
 *
 * updateLinks のロジックは REST クライアントを spyOn でモックして WS 接続を回避する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageUpdateLinksCommand } from "@/commands/page/update-links"
import * as pages from "@/core/pages"

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

async function runUpdateLinks(args: Record<string, unknown>) {
  await (
    pageUpdateLinksCommand.run as (ctx: {
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

// ---------------------------------------------------------------------------
// セットアップ
// ---------------------------------------------------------------------------

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let updateLinksSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"
  updateLinksSpy = spyOn(pages, "updateLinks").mockImplementation(async () => ({
    updatedCount: 5,
  }))
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  updateLinksSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("pageUpdateLinksCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runUpdateLinks({
        from: "旧タイトル",
        to: "新タイトル",
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--dry-run 時は API を呼ばずに dryRun: true を出力する", async () => {
    await runUpdateLinks({
      from: "Node.js",
      to: "Node",
      project: "テストプロジェクト",
      json: true,
      plain: false,
      "results-only": false,
      "dry-run": true,
      quiet: false,
    })

    // API 呼び出しなし
    expect(updateLinksSpy).not.toHaveBeenCalled()

    // JSON 出力に dryRun: true が含まれること
    const output = stdoutMock.mock.calls.flat().join("") as string
    const parsed = JSON.parse(output)
    expect(parsed.data.dryRun).toBe(true)
    expect(parsed.data.from).toBe("Node.js")
    expect(parsed.data.to).toBe("Node")
  })

  it("正常実行時に updatedCount を含む JSON を出力する", async () => {
    await runUpdateLinks({
      from: "Node.js",
      to: "Node",
      project: "テストプロジェクト",
      json: true,
      plain: false,
      "results-only": false,
      "dry-run": false,
      quiet: false,
    })

    expect(updateLinksSpy).toHaveBeenCalledTimes(1)

    const output = stdoutMock.mock.calls.flat().join("") as string
    const parsed = JSON.parse(output)
    expect(parsed.data.from).toBe("Node.js")
    expect(parsed.data.to).toBe("Node")
    expect(parsed.data.updatedCount).toBe(5)
  })

  it("sandbox 違反の場合は exit 7 で終了する", async () => {
    try {
      await runUpdateLinks({
        from: "旧タイトル",
        to: "新タイトル",
        project: "テストプロジェクト",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "enable-commands": "page.list",
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})
