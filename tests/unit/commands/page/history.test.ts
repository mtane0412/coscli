/**
 * page/history.test.ts — `cos page history` コマンドのテスト。
 *
 * Scrapbox commits API を叩いてページのコミット履歴を返すコマンドを検証する。
 * - 正常系: コミット一覧が JSON で取れる
 * - --limit によるスライス動作
 * - --head がクエリパラメータに乗ること
 * - --page-id 指定で title → pageId 解決をスキップする
 * - --since 指定で指定 commitId より後のコミットのみ返す
 * - 認証エラー → exit 2
 * - 404 (ページ未存在) → exit 4
 * - project 未指定 → exit 5
 * - title と --page-id の両方未指定 → exit 5
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageHistoryCommand } from "@/commands/page/history"
import * as pages from "@/core/pages"
import type { CommitsResponse } from "@/schemas/commit"
import type { Page } from "@/schemas/page"
import pageHistoryFixture from "../../../fixtures/commits/page-history.json"
import pageDetailFixture from "../../../fixtures/page-detail.json"

/** コマンド run ヘルパー */
async function runHistory(args: Record<string, unknown>) {
  await (
    pageHistoryCommand.run as (ctx: {
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

/** デフォルトの正常系引数 */
const defaultArgs = {
  project: "テストプロジェクト",
  title: "Hello World",
  "page-id": undefined,
  since: undefined,
  limit: undefined,
  head: undefined,
  json: true,
  plain: false,
  "results-only": false,
  quiet: false,
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let getPageSpy: ReturnType<typeof spyOn>
let getPageCommitsSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"

  // getPage のモック (title → pageId 解決)
  getPageSpy = spyOn(pages, "getPage").mockResolvedValue(pageDetailFixture as unknown as Page)

  // getPageCommits のモック
  getPageCommitsSpy = spyOn(pages, "getPageCommits").mockResolvedValue(
    pageHistoryFixture as CommitsResponse,
  )
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  getPageSpy.mockRestore()
  getPageCommitsSpy.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageHistoryCommand", () => {
  describe("正常系", () => {
    it("--json フラグ付きでコミット一覧が JSON 出力される", async () => {
      try {
        await runHistory(defaultArgs)
      } catch {
        // process.exit モック後の継続による throw は想定内
      }

      // exit が呼ばれていない = エラーなし
      expect(exitMock).not.toHaveBeenCalled()

      // stdout に JSON envelope が書き込まれている
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      // writeJson の envelope 形式: { data: { commits: [...] }, meta: { ... } }
      expect(json.data.commits).toHaveLength(3)
      expect(json.data.commits[0].id).toBe("commit-id-2")
    })

    it("title に対応するページの pageId を使って getPageCommits が呼ばれる", async () => {
      try {
        await runHistory(defaultArgs)
      } catch {
        // 想定内
      }

      expect(getPageCommitsSpy).toHaveBeenCalledTimes(1)
      // getPage で取得した pageId (page-id-hello) が使われること
      const callArgs = getPageCommitsSpy.mock.calls[0]
      // 第2引数が opts オブジェクト (project + pageId + head)
      expect(callArgs?.[1]).toMatchObject({ pageId: "page-id-hello" })
    })
  })

  describe("--limit フラグ", () => {
    it("--limit 2 で上位 2 件にスライスされる", async () => {
      try {
        await runHistory({ ...defaultArgs, limit: "2" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      expect(json.data.commits).toHaveLength(2)
    })

    it("--limit がフィクスチャ件数より大きい場合は全件返す", async () => {
      try {
        await runHistory({ ...defaultArgs, limit: "100" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      // フィクスチャが 3 件なので全件
      expect(json.data.commits).toHaveLength(3)
    })

    it("--limit abc (文字列) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runHistory({ ...defaultArgs, limit: "abc" })
      } catch {
        // 想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
    })

    it("--limit -1 (負数) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runHistory({ ...defaultArgs, limit: "-1" })
      } catch {
        // 想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
    })

    it("--limit 0 (ゼロ) は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runHistory({ ...defaultArgs, limit: "0" })
      } catch {
        // 想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
    })
  })

  describe("--head フラグ", () => {
    it("--head を指定すると getPageCommits に head が渡される", async () => {
      try {
        await runHistory({ ...defaultArgs, head: "commit-id-1" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const callArgs = getPageCommitsSpy.mock.calls[0]
      // 第2引数の opts に head が含まれること
      expect(callArgs?.[1]).toMatchObject({ head: "commit-id-1" })
    })

    it("--head を省略した場合は opts.head が undefined になる", async () => {
      try {
        await runHistory(defaultArgs)
      } catch {
        // 想定内
      }

      const callArgs = getPageCommitsSpy.mock.calls[0]
      // head が undefined (または存在しない) こと
      expect((callArgs?.[1] as Record<string, unknown>)?.["head"]).toBeUndefined()
    })
  })

  describe("--plain フラグ", () => {
    it("--plain で TSV 形式（ヘッダー行 + データ行）が出力される", async () => {
      try {
        await runHistory({ ...defaultArgs, json: false, plain: true })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      // writeTsv: ヘッダー1行 + フィクスチャ3件 = 4回 write が呼ばれる
      const writtenLines = stdoutMock.mock.calls.map((c: unknown[]) => c[0] as string)
      expect(writtenLines).toHaveLength(4)
      // ヘッダー行はタブ区切りの列名
      expect(writtenLines[0]).toBe("id\tcreated\tuserId\tchanges\n")
      // データ行はタブ区切りの id、ISO 8601 日時、userId、changes 数
      expect(writtenLines[1]).toMatch(/^commit-id-2\t20\d{2}-/)
    })
  })

  describe("--page-id フラグ", () => {
    it("--page-id を指定すると title なしで getPageCommits が呼ばれる", async () => {
      try {
        await runHistory({ ...defaultArgs, title: "", "page-id": "page-id-hello" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      // --page-id 指定時は getPage をスキップするので呼ばれない
      expect(getPageSpy).not.toHaveBeenCalled()
      // getPageCommits は --page-id の値で呼ばれる
      const callArgs = getPageCommitsSpy.mock.calls[0]
      expect(callArgs?.[1]).toMatchObject({ pageId: "page-id-hello" })
    })

    it("--page-id 指定時は JSON でコミット一覧が返る", async () => {
      try {
        await runHistory({ ...defaultArgs, title: "", "page-id": "page-id-hello" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      expect(json.data.commits).toHaveLength(3)
    })
  })

  describe("--since フラグ", () => {
    it("--since commit-id-1 を指定すると commit-id-1 より新しいコミットのみ返る", async () => {
      // フィクスチャの順序: [commit-id-2, commit-id-1, commit-id-0]
      // commit-id-1 のインデックス = 1 → インデックス 0 (commit-id-2) のみを返す
      try {
        await runHistory({ ...defaultArgs, since: "commit-id-1" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      expect(json.data.commits).toHaveLength(1)
      expect(json.data.commits[0].id).toBe("commit-id-2")
    })

    it("--since commit-id-0 を指定すると commit-id-2 と commit-id-1 が返る", async () => {
      // commit-id-0 のインデックス = 2 → インデックス 0,1 (commit-id-2, commit-id-1) を返す
      try {
        await runHistory({ ...defaultArgs, since: "commit-id-0" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      expect(json.data.commits).toHaveLength(2)
      expect(json.data.commits[0].id).toBe("commit-id-2")
      expect(json.data.commits[1].id).toBe("commit-id-1")
    })

    it("--since に存在しない commitId を指定した場合は全件返る", async () => {
      try {
        await runHistory({ ...defaultArgs, since: "commit-id-999" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      expect(json.data.commits).toHaveLength(3)
    })

    it("--since が最新 commitId の場合は空配列が返る", async () => {
      // commit-id-2 が最新 (index=0) → それより新しいコミットはない → 空
      try {
        await runHistory({ ...defaultArgs, since: "commit-id-2" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      expect(json.data.commits).toHaveLength(0)
    })

    it("--since と --limit を組み合わせた場合は --since 適用後に --limit でスライスされる", async () => {
      // --since commit-id-0 → [commit-id-2, commit-id-1] → --limit 1 → [commit-id-2]
      try {
        await runHistory({ ...defaultArgs, since: "commit-id-0", limit: "1" })
      } catch {
        // 想定内
      }

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const json = JSON.parse(output)
      expect(json.data.commits).toHaveLength(1)
      expect(json.data.commits[0].id).toBe("commit-id-2")
    })
  })

  describe("エラー系", () => {
    it("project 未指定は PROJECT_REQUIRED で exit 5 になる", async () => {
      try {
        await runHistory({
          ...defaultArgs,
          project: undefined,
        })
      } catch {
        // 想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("PROJECT_REQUIRED"))
    })

    it("title と --page-id の両方未指定は VALIDATION_ERROR で exit 5 になる", async () => {
      try {
        await runHistory({
          ...defaultArgs,
          title: "",
          "page-id": undefined,
        })
      } catch {
        // 想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
    })

    it("getPage が NotFoundError をスローした場合は exit 4 になる", async () => {
      const { NotFoundError } = await import("@/core/api/rest")
      getPageSpy.mockRejectedValue(new NotFoundError("Hello World"))

      try {
        await runHistory(defaultArgs)
      } catch {
        // 想定内
      }

      expect(exitMock).toHaveBeenCalledWith(4)
    })

    it("getPage が AuthError をスローした場合は exit 2 になる", async () => {
      const { AuthError } = await import("@/core/api/rest")
      getPageSpy.mockRejectedValue(new AuthError())

      try {
        await runHistory(defaultArgs)
      } catch {
        // 想定内
      }

      expect(exitMock).toHaveBeenCalledWith(2)
    })
  })
})
