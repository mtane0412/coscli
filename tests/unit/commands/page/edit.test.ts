/**
 * page/edit.test.ts — `cos page edit <title>` コマンドのテスト。
 *
 * バリデーション (--input-format の無効値、空コンテンツ) を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pageEditCommand } from "@/commands/page/edit"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

async function runEdit(args: Record<string, unknown>) {
  await (
    pageEditCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
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

describe("pageEditCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    // 一時ファイルを作成
    const tmpFile = join(tmpdir(), `cos-test-edit-${Date.now()}.txt`)
    writeFileSync(tmpFile, "テスト本文\n")
    try {
      await runEdit({
        title: "テストページ",
        "from-file": tmpFile,
        "input-format": "txt",
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

  it("--input-format に未知の値を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    const tmpFile = join(tmpdir(), `cos-test-edit-${Date.now()}.xml`)
    writeFileSync(tmpFile, "<doc>テスト</doc>\n")
    try {
      await runEdit({
        title: "テストページ",
        "from-file": tmpFile,
        "input-format": "xml",
        project: "テストプロジェクト",
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
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
  })

  it("--input-format=md の場合、MD ファイルを読み込んでバリデーションを通過し先へ進む", async () => {
    // MD ファイルを作成
    const tmpFile = join(tmpdir(), `cos-test-edit-${Date.now()}.md`)
    writeFileSync(tmpFile, "## テスト見出し\n本文テキスト\n")
    try {
      await runEdit({
        title: "テストページ",
        "from-file": tmpFile,
        "input-format": "md",
        project: "テストプロジェクト",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // buildWriter が認証を要求するため throw される。バリデーションは通過している
    }
    // VALIDATION_ERROR が出ていないこと (MD フォーマットは有効)
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(calls).not.toContain("VALIDATION_ERROR")
    // exit 5 が VALIDATION_ERROR 由来でないこと (認証エラーの exit 2 などはあり得る)
    expect(exitMock).not.toHaveBeenCalledWith(5)
  })
})
