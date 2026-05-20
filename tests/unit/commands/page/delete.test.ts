/**
 * delete.test.ts — `cos page delete` コマンドのユニットテスト。
 *
 * --no-input / --force 排他ロジックと citty パーサを通じた CLI 経路を検証する。
 * issue #39 (--no-input ハング) および issue #40 (non-TTY / COS_NO_INPUT ハング) の回帰防止を目的とする。
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
  Reflect.deleteProperty(process.env, "COS_NO_INPUT")
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
    // exitWithError が process.exit モック後に throw するため try-catch で握り潰す。
    process.env["COS_PROJECT"] = "テストプロジェクト"
    try {
      await runCommand(pageDeleteCommand, { rawArgs: ["テストページ", "--no-input"] })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
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

describe("pageDeleteCommand — non-TTY / COS_NO_INPUT ガード (issue #40 回帰)", () => {
  // テスト前後で isTTY と COS_NO_INPUT を退避・復元する
  let originalIsTTY: boolean | undefined

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY
  })

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: originalIsTTY,
      configurable: true,
      writable: true,
    })
    Reflect.deleteProperty(process.env, "COS_NO_INPUT")
  })

  it("stdin が non-TTY の場合は --force なしで exit 5 で終了する", async () => {
    // CI / パイプ環境では process.stdin.isTTY が undefined になる。
    // この状態で --force を渡さずに実行すると対話 confirm() に突入してハングするため、
    // 即エラー終了する必要がある。
    // exitWithError が process.exit モック後に throw するため try-catch で握り潰す。
    Object.defineProperty(process.stdin, "isTTY", {
      value: undefined,
      configurable: true,
      writable: true,
    })
    process.env["COS_PROJECT"] = "テストプロジェクト"
    try {
      await runCommand(pageDeleteCommand, { rawArgs: ["テストページ"] })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("COS_NO_INPUT=1 の場合は --force なしで exit 5 で終了する", async () => {
    // COS_NO_INPUT 環境変数はエージェントが非対話モードを要求するために使用する。
    // この場合も --force なしでは確認できないためエラー終了する。
    // exitWithError が process.exit モック後に throw するため try-catch で握り潰す。
    process.env["COS_NO_INPUT"] = "1"
    process.env["COS_PROJECT"] = "テストプロジェクト"
    try {
      await runCommand(pageDeleteCommand, { rawArgs: ["テストページ"] })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("stdin が non-TTY でも --force 指定時は exit 5 で終了しない", async () => {
    // non-TTY 環境でも --force を明示すれば削除処理に進む。
    Object.defineProperty(process.stdin, "isTTY", {
      value: undefined,
      configurable: true,
      writable: true,
    })
    process.env["COS_PROJECT"] = "テストプロジェクト"
    process.env["COS_SID"] = "s%3Adummy-sid"
    await runCommand(pageDeleteCommand, { rawArgs: ["テストページ", "--force", "--dry-run"] })
    expect(exitMock).not.toHaveBeenCalledWith(5)
  })

  it("COS_NO_INPUT=1 でも --force 指定時は exit 5 で終了しない", async () => {
    // COS_NO_INPUT が設定されていても --force を明示すれば削除処理に進む。
    process.env["COS_NO_INPUT"] = "1"
    process.env["COS_PROJECT"] = "テストプロジェクト"
    process.env["COS_SID"] = "s%3Adummy-sid"
    await runCommand(pageDeleteCommand, { rawArgs: ["テストページ", "--force", "--dry-run"] })
    expect(exitMock).not.toHaveBeenCalledWith(5)
  })
})
