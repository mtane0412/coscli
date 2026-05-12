/**
 * delete.test.ts — `cos page delete` コマンドのユニットテスト。
 *
 * --no-input / --force 排他ロジックと citty パーサを通じた CLI 経路を検証する。
 * 主に issue #39 (--no-input ハング) の回帰防止を目的とする。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageDeleteCommand } from "@/commands/page/delete"
import { runCommand } from "citty"

// ---------------------------------------------------------------------------
// テスト前後処理
// ---------------------------------------------------------------------------

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  // 環境変数を初期化
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_PROJECT")
})

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("pageDeleteCommand — --no-input ガード (issue #39 回帰)", () => {
  it("rawArgs ['テストページ', '--no-input'] が citty parser を経由しても exit 5 で終了する", async () => {
    // citty パーサは --no-input を args.input = false に変換する (args["no-input"] は undefined)。
    // 修正前は !a["no-input"] → true になるため対話 confirm() に突入してハングする。
    // このテストはその経路を再現して回帰を防止する。
    process.env["COS_PROJECT"] = "テストプロジェクト"
    await runCommand(pageDeleteCommand, { rawArgs: ["テストページ", "--no-input"] })
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("rawArgs ['テストページ', '--no-input', '--force', '--dry-run'] の場合は exit 5 で終了しない", async () => {
    // --force と --no-input を同時指定した場合は確認をスキップして削除処理に進む。
    // --dry-run でネットワーク接続を回避しつつ、exit 5 が呼ばれないことだけを検証する。
    process.env["COS_PROJECT"] = "テストプロジェクト"
    process.env["COS_SID"] = "s%3Adummy-sid"
    await runCommand(pageDeleteCommand, {
      rawArgs: ["テストページ", "--no-input", "--force", "--dry-run"],
    })
    expect(exitMock).not.toHaveBeenCalledWith(5)
  })
})
