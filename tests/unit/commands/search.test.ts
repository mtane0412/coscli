/**
 * search.test.ts — `cos search` コマンドのテスト。
 *
 * プロジェクト内検索 (既存) と --joined フラグによる参加プロジェクト横断検索の
 * 動作を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { searchCommand } from "@/commands/search"
import { CosenseRestClient } from "@/core/api/rest"

/** SearchResult の最小限フィクスチャ (プロジェクト内検索) */
const SEARCH_PAGES_FIXTURE = {
  projectName: "テストプロジェクト",
  searchQuery: "hello",
  pages: [
    { id: "page-id-1", title: "Hello World" },
    { id: "page-id-2", title: "Helloと挨拶" },
  ],
}

/** ProjectSearchResult の最小限フィクスチャ (参加プロジェクト横断検索) */
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
let searchPagesSpy: ReturnType<typeof spyOn>
let searchJoinedProjectsSpy: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runSearch(args: Record<string, unknown>) {
  await (
    searchCommand.run as (ctx: {
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

/** 共通の args ベース (プロジェクト内検索用) */
function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    query: "hello",
    project: "テストプロジェクト",
    json: false,
    plain: false,
    "results-only": false,
    quiet: true,
    joined: false,
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
  // CosenseRestClient のメソッドをモック
  searchPagesSpy = spyOn(CosenseRestClient.prototype, "searchPages").mockResolvedValue(
    SEARCH_PAGES_FIXTURE as never,
  )
  searchJoinedProjectsSpy = spyOn(
    CosenseRestClient.prototype,
    "searchJoinedProjects",
  ).mockResolvedValue(SEARCH_JOINED_FIXTURE as never)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  searchPagesSpy.mockRestore()
  searchJoinedProjectsSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("searchCommand", () => {
  describe("--joined なし (既存のプロジェクト内検索)", () => {
    it("searchPages が呼ばれ title 一覧を改行区切りで出力する", async () => {
      await runSearch(baseArgs())
      // searchPages が呼ばれること
      expect(searchPagesSpy).toHaveBeenCalledTimes(1)
      // searchJoinedProjects は呼ばれないこと
      expect(searchJoinedProjectsSpy).not.toHaveBeenCalled()
      // 結果が標準出力に書き出されること
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      expect(output).toContain("Hello World")
      expect(output).toContain("Helloと挨拶")
    })

    it("--project 未指定かつ COS_PROJECT 未設定は PROJECT_REQUIRED で exit 5 になる", async () => {
      try {
        await runSearch({ ...baseArgs(), project: undefined })
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("PROJECT_REQUIRED"))
    })
  })

  describe("--joined (参加プロジェクト横断検索)", () => {
    it("searchJoinedProjects が呼ばれ name と displayName をタブ区切りで出力する", async () => {
      await runSearch(baseArgs({ joined: true, project: undefined }))
      // searchJoinedProjects が呼ばれること
      expect(searchJoinedProjectsSpy).toHaveBeenCalledTimes(1)
      // searchPages は呼ばれないこと
      expect(searchPagesSpy).not.toHaveBeenCalled()
      // 出力に name と displayName が含まれること
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      expect(output).toContain("myproject")
      expect(output).toContain("マイプロジェクト")
      expect(output).toContain("helpproject")
      expect(output).toContain("ヘルプ")
    })

    it("--joined と --project を同時指定すると PROJECT_AND_JOINED_EXCLUSIVE で exit 5 になる", async () => {
      try {
        await runSearch(baseArgs({ joined: true, project: "テストプロジェクト" }))
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(
        expect.stringContaining("PROJECT_AND_JOINED_EXCLUSIVE"),
      )
    })

    it("--joined と COS_PROJECT を同時指定すると PROJECT_AND_JOINED_EXCLUSIVE で exit 5 になる", async () => {
      process.env["COS_PROJECT"] = "環境変数プロジェクト"
      try {
        await runSearch(baseArgs({ joined: true, project: undefined }))
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(
        expect.stringContaining("PROJECT_AND_JOINED_EXCLUSIVE"),
      )
    })

    it("--joined --json で projects 配列を含む JSON envelope を出力する", async () => {
      await runSearch(baseArgs({ joined: true, project: undefined, json: true }))
      const output = (stdoutMock.mock.calls as string[][]).map((c) => c[0]).join("")
      const parsed = JSON.parse(output)
      // command フィールドが含まれること
      expect(parsed.meta.command).toBe("search")
      // projects 配列が含まれること
      expect(parsed.data.projects).toHaveLength(2)
      expect(parsed.data.projects[0].name).toBe("myproject")
    })
  })
})
