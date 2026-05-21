/**
 * watch-list/add.test.ts — `cos watch-list add` コマンドのテスト。
 *
 * ローカル config の watchlist フィールドにプロジェクトを追加する動作を検証する。
 * XDG_CONFIG_HOME を一時ディレクトリに向けて副作用を隔離する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { watchListAddCommand } from "@/commands/watch-list/add"
import type { CoscliConfig } from "@/infra/config"
import { loadConfig, saveConfig } from "@/infra/config"

/** 一時設定ディレクトリ */
const TEST_CONFIG_DIR = join(tmpdir(), `coscli-watchlist-add-test-${Date.now()}`)
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
async function runWatchListAdd(args: Record<string, unknown>) {
  await (
    watchListAddCommand.run as (ctx: {
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

describe("watchListAddCommand", () => {
  it("watchlist が空のとき、プロジェクトを追加できる", async () => {
    writeTestConfig({})
    await runWatchListAdd(baseArgs("my-project"))
    const config = readTestConfig()
    expect(config.watchlist).toEqual(["my-project"])
  })

  it("既存の watchlist にプロジェクトを追加できる", async () => {
    writeTestConfig({ watchlist: ["project-alpha"] })
    await runWatchListAdd(baseArgs("project-beta"))
    const config = readTestConfig()
    expect(config.watchlist).toEqual(["project-alpha", "project-beta"])
  })

  it("すでにウォッチリストにあるプロジェクトは重複追加されない", async () => {
    writeTestConfig({ watchlist: ["project-alpha"] })
    await runWatchListAdd(baseArgs("project-alpha"))
    const config = readTestConfig()
    // 重複なし: 1件のまま
    expect(config.watchlist).toEqual(["project-alpha"])
  })

  it("config が存在しないとき、新規作成してプロジェクトを追加できる", async () => {
    // 設定ファイルなしの状態で実行する
    await runWatchListAdd(baseArgs("brand-new-project"))
    const config = readTestConfig()
    expect(config.watchlist).toEqual(["brand-new-project"])
  })

  it("--disable-commands で watch-list.add を禁止するとエラー終了する", async () => {
    writeTestConfig({})
    // exitWithError が process.exit モック後に throw するため try-catch で握り潰す
    try {
      await runWatchListAdd(baseArgs("my-project", { "disable-commands": "watch-list.add" }))
    } catch {
      // 期待通りの throw
    }
    expect(exitMock).toHaveBeenCalledWith(7)
    // config は変更されない
    const config = readTestConfig()
    expect(config.watchlist).toBeUndefined()
  })
})
