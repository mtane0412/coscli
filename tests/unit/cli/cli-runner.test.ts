/**
 * cli-runner.test.ts — runWithHelpAndErrors() のテスト。
 *
 * --help / --version 経路と、エラーキャッチ → exit コードマッピングを内包する関数。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { runWithHelpAndErrors } from "@/infra/cli-runner"
import { defineCommand } from "citty"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
})

/** テスト用の最小コマンドを生成するヘルパー */
function makeTestCommand(version = "1.0.0") {
  return defineCommand({
    meta: { name: "テスト", version, description: "テスト用コマンド" },
    args: {},
    run() {},
  })
}

describe("runWithHelpAndErrors", () => {
  it("--help フラグで exit 0 で終了する", async () => {
    const main = makeTestCommand()
    try {
      await runWithHelpAndErrors(main, ["--help"])
    } catch {
      // process.exit モック後の throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(0)
  })

  it("-h フラグで exit 0 で終了する", async () => {
    const main = makeTestCommand()
    try {
      await runWithHelpAndErrors(main, ["-h"])
    } catch {
      // process.exit モック後の throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(0)
  })

  it("--version フラグ単独で exit 0 で終了する", async () => {
    const main = makeTestCommand("2.3.4")
    try {
      await runWithHelpAndErrors(main, ["--version"])
    } catch {
      // process.exit モック後の throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(0)
  })

  it("--version でバージョン文字列を出力する", async () => {
    const main = makeTestCommand("1.2.3")
    try {
      await runWithHelpAndErrors(main, ["--version"])
    } catch {
      // 想定内
    }
    const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(output).toContain("1.2.3")
  })

  it("コマンド実行が成功した場合は process.exit を呼ばない", async () => {
    const main = defineCommand({
      meta: { name: "テスト" },
      args: {},
      run() {},
    })
    await runWithHelpAndErrors(main, [])
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("コマンド実行でエラーが発生した場合は exit 1 で終了する", async () => {
    const main = defineCommand({
      meta: { name: "テスト" },
      args: {},
      run() {
        throw new Error("一般エラー")
      },
    })
    try {
      await runWithHelpAndErrors(main, [])
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(1)
  })
})
