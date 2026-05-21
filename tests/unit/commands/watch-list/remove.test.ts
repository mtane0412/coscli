/**
 * watch-list/remove.test.ts — `cos watch-list remove` コマンドのテスト。
 *
 * ローカル config の watchlist フィールドからプロジェクトを削除する動作を検証する。
 * XDG_CONFIG_HOME を一時ディレクトリに向けて副作用を隔離する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { watchListRemoveCommand } from "@/commands/watch-list/remove"
import type { CoscliConfig } from "@/infra/config"
import { loadConfig, saveConfig } from "@/infra/config"

/** 一時設定ディレクトリ */
const TEST_CONFIG_DIR = join(tmpdir(), `coscli-watchlist-remove-test-${Date.now()}`)
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, "coscli", "config.json5")

/** テスト用設定を書き込むヘルパー */
function writeTestConfig(config: CoscliConfig): void {
  saveConfig(config, TEST_CONFIG_FILE)
}

/** 現在の設定を読み込むヘルパー */
function readTestConfig(): CoscliConfig {
  return loadConfig(TEST_CONFIG_FILE)
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runWatchListRemove(args: Record<string, unknown>) {
  await (
    watchListRemoveCommand.run as (ctx: {
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
function baseArgs(project: string, overrides: Record<string, unknown> = {}) {
  return {
    project_name: project,
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

describe("watchListRemoveCommand", () => {
  it("ウォッチリストからプロジェクトを削除できる", async () => {
    writeTestConfig({ watchlist: ["project-alpha", "project-beta"] })
    await runWatchListRemove(baseArgs("project-alpha"))
    const config = readTestConfig()
    expect(config.watchlist).toEqual(["project-beta"])
  })

  it("1件だけのウォッチリストを削除すると空配列になる", async () => {
    writeTestConfig({ watchlist: ["only-project"] })
    await runWatchListRemove(baseArgs("only-project"))
    const config = readTestConfig()
    expect(config.watchlist).toEqual([])
  })

  it("ウォッチリストに存在しないプロジェクトを削除しようとすると exit 4 で終了する", async () => {
    writeTestConfig({ watchlist: ["project-alpha"] })
    // exitWithError が process.exit モック後に throw するため try-catch で握り潰す
    try {
      await runWatchListRemove(baseArgs("存在しないプロジェクト"))
    } catch {
      // 期待通りの throw
    }
    expect(exitMock).toHaveBeenCalledWith(4)
    // config は変更されない
    const config = readTestConfig()
    expect(config.watchlist).toEqual(["project-alpha"])
  })

  it("watchlist が空のとき削除しようとすると exit 4 で終了する", async () => {
    writeTestConfig({})
    // exitWithError が process.exit モック後に throw するため try-catch で握り潰す
    try {
      await runWatchListRemove(baseArgs("my-project"))
    } catch {
      // 期待通りの throw
    }
    expect(exitMock).toHaveBeenCalledWith(4)
  })

  it("--disable-commands で watch-list.remove を禁止するとエラー終了する", async () => {
    writeTestConfig({ watchlist: ["project-alpha"] })
    // exitWithError が process.exit モック後に throw するため try-catch で握り潰す
    try {
      await runWatchListRemove(
        baseArgs("project-alpha", { "disable-commands": "watch-list.remove" }),
      )
    } catch {
      // 期待通りの throw
    }
    expect(exitMock).toHaveBeenCalledWith(7)
    // config は変更されない
    const config = readTestConfig()
    expect(config.watchlist).toEqual(["project-alpha"])
  })
})
