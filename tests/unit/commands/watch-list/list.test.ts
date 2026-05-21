/**
 * watch-list/list.test.ts — `cos watch-list list` コマンドのテスト。
 *
 * ローカル config の watchlist フィールドを読み込んで出力する動作を検証する。
 * XDG_CONFIG_HOME を一時ディレクトリに向けて副作用を隔離する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { watchListListCommand } from "@/commands/watch-list/list"
import type { CoscliConfig } from "@/infra/config"
import { saveConfig } from "@/infra/config"

/** 一時設定ディレクトリ */
const TEST_CONFIG_DIR = join(tmpdir(), `coscli-watchlist-list-test-${Date.now()}`)
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, "coscli", "config.json5")

/** テスト用設定を書き込むヘルパー */
function writeTestConfig(config: CoscliConfig): void {
  saveConfig(config, TEST_CONFIG_FILE)
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runWatchListList(args: Record<string, unknown>) {
  await (
    watchListListCommand.run as (ctx: {
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

/** 共通の args ベース */
function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    json: false,
    plain: false,
    "results-only": false,
    quiet: true,
    ...overrides,
  }
}

beforeEach(() => {
  process.env["XDG_CONFIG_HOME"] = TEST_CONFIG_DIR
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "XDG_CONFIG_HOME")
  try {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true })
  } catch {
    // クリーンアップ失敗は無視する
  }
})

describe("watchListListCommand", () => {
  it("ウォッチリストのプロジェクト名を1行ずつ出力する", async () => {
    writeTestConfig({ watchlist: ["project-alpha", "project-beta", "project-gamma"] })
    await runWatchListList(baseArgs())
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toContain("project-alpha")
    expect(output).toContain("project-beta")
    expect(output).toContain("project-gamma")
  })

  it("watchlist が空のとき何も出力しない", async () => {
    writeTestConfig({ watchlist: [] })
    await runWatchListList(baseArgs())
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toBe("")
  })

  it("config に watchlist がないとき何も出力しない", async () => {
    writeTestConfig({})
    await runWatchListList(baseArgs())
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toBe("")
  })

  it("--json で watchlist 配列を含む JSON envelope を出力する", async () => {
    writeTestConfig({ watchlist: ["project-alpha", "project-beta"] })
    await runWatchListList(baseArgs({ json: true }))
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    const parsed = JSON.parse(output)
    expect(parsed.meta.command).toBe("watch-list.list")
    expect(parsed.data.watchlist).toEqual(["project-alpha", "project-beta"])
  })

  it("--json で watchlist が空のとき空配列を返す", async () => {
    writeTestConfig({})
    await runWatchListList(baseArgs({ json: true }))
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    const parsed = JSON.parse(output)
    expect(parsed.data.watchlist).toEqual([])
  })
})
