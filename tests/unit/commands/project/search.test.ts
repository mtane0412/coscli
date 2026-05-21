/**
 * project/search.test.ts — `cos project search` コマンドのテスト。
 *
 * 参加プロジェクト横断検索でマッチしたプロジェクト一覧を返す動作を検証する。
 * --watch-list / --joined フラグの動作も検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { projectSearchCommand } from "@/commands/project/search"
import { CosenseRestClient } from "@/core/api/rest"
import type { CoscliConfig } from "@/infra/config"
import { saveConfig } from "@/infra/config"

/** 一時設定ディレクトリ (--watch-list フラグのテスト用) */
const TEST_CONFIG_DIR = join(tmpdir(), `coscli-project-search-test-${Date.now()}`)
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, "coscli", "config.json5")

/** テスト用設定を書き込むヘルパー */
function writeTestConfig(config: CoscliConfig): void {
  saveConfig(config, TEST_CONFIG_FILE)
}

/** ProjectSearchResult の最小限フィクスチャ */
const SEARCH_JOINED_FIXTURE = {
  searchQuery: "hello",
  query: { words: ["hello"], excludes: [] },
  projects: [
    { _id: "proj-id-my", name: "myproject", displayName: "マイプロジェクト" },
    { _id: "proj-id-help", name: "helpproject", displayName: "ヘルプ" },
  ],
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let searchJoinedProjectsSpy: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runProjectSearch(args: Record<string, unknown>) {
  await (
    projectSearchCommand.run as (ctx: {
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
    query: "hello",
    json: false,
    plain: false,
    "results-only": false,
    quiet: true,
    ...overrides,
  }
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  // buildRestClient がキーチェーン呼び出しをスキップできるようダミー SID を設定する
  process.env["COS_SID"] = "s%3Atest-session-id"
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  searchJoinedProjectsSpy = spyOn(
    CosenseRestClient.prototype,
    "searchJoinedProjects",
  ).mockResolvedValue(SEARCH_JOINED_FIXTURE as never)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  searchJoinedProjectsSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "XDG_CONFIG_HOME")
  try {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true })
  } catch {
    // クリーンアップ失敗は無視する
  }
})

describe("projectSearchCommand", () => {
  it("searchJoinedProjects が呼ばれ name と displayName をタブ区切りで出力する", async () => {
    await runProjectSearch(baseArgs())
    expect(searchJoinedProjectsSpy).toHaveBeenCalledTimes(1)
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toContain("myproject")
    expect(output).toContain("マイプロジェクト")
    expect(output).toContain("helpproject")
    expect(output).toContain("ヘルプ")
  })

  it("--json で projects 配列を含む JSON envelope を出力する", async () => {
    await runProjectSearch(baseArgs({ json: true }))
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    const parsed = JSON.parse(output)
    expect(parsed.meta.command).toBe("project.search")
    expect(parsed.data.projects).toHaveLength(2)
    expect(parsed.data.projects[0].name).toBe("myproject")
  })

  it("クエリが API に正しく渡される", async () => {
    await runProjectSearch(baseArgs({ query: "テスト検索ワード" }))
    expect(searchJoinedProjectsSpy).toHaveBeenCalledWith("テスト検索ワード")
  })
})

describe("projectSearchCommand - --joined フラグ", () => {
  it("--joined フラグで参加プロジェクト全体を検索する (フラグなし時と同じ挙動)", async () => {
    await runProjectSearch(baseArgs({ joined: true }))
    expect(searchJoinedProjectsSpy).toHaveBeenCalledTimes(1)
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toContain("myproject")
    expect(output).toContain("helpproject")
  })
})

describe("projectSearchCommand - --watch-list フラグ", () => {
  beforeEach(() => {
    process.env["XDG_CONFIG_HOME"] = TEST_CONFIG_DIR
  })

  it("--watch-list でウォッチリスト内のプロジェクトのみ返す", async () => {
    // myproject のみウォッチリストに登録
    writeTestConfig({ watchlist: ["myproject"] })
    await runProjectSearch(baseArgs({ "watch-list": true }))
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toContain("myproject")
    // helpproject はウォッチリスト外なので出力されない
    expect(output).not.toContain("helpproject")
  })

  it("--watch-list でウォッチリストが空のとき exit 5 で終了しエラーメッセージを出力する", async () => {
    writeTestConfig({})
    // exitWithError が process.exit モック後に throw するため try-catch で握り潰す
    try {
      await runProjectSearch(baseArgs({ "watch-list": true }))
    } catch {
      // 期待通りの throw
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toContain("ウォッチリストが空")
  })

  it("--watch-list の JSON 出力でウォッチリスト内プロジェクトのみ含む", async () => {
    writeTestConfig({ watchlist: ["myproject"] })
    await runProjectSearch(baseArgs({ "watch-list": true, json: true }))
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    const parsed = JSON.parse(output)
    expect(parsed.data.projects).toHaveLength(1)
    expect(parsed.data.projects[0].name).toBe("myproject")
  })

  it("--joined と --watch-list を同時指定するとすべての参加プロジェクトから watch-list でフィルタする", async () => {
    // 両方指定した場合の動作確認
    writeTestConfig({ watchlist: ["helpproject"] })
    await runProjectSearch(baseArgs({ joined: true, "watch-list": true }))
    const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
    expect(output).toContain("helpproject")
    expect(output).not.toContain("myproject")
  })
})
