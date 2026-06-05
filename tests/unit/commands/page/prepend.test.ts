/**
 * page/prepend.test.ts — `cos page prepend preview <title>` コマンドのテスト。
 *
 * v2 AI ops API (PAT 必須) を使ってページ先頭（タイトル直後）に行を挿入する
 * preview コマンドを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pagePrependPreviewCommand } from "@/commands/page/prepend/preview"
import type * as restModule from "@/core/api/rest"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let buildRestClientSpy: ReturnType<typeof spyOn> | undefined
let requirePatSpy: ReturnType<typeof spyOn> | undefined

/** テスト用 PAT フォーマット */
const TEST_PAT = `pat_${"a".repeat(64)}`

/** 2 行以上あるページのフィクスチャ */
const pageWithBody = {
  id: "ページID-テスト",
  title: "テストページ",
  lines: [
    { id: "行001", text: "テストページ", userId: "u1", created: 0, updated: 0 },
    { id: "行002", text: "既存の行", userId: "u1", created: 0, updated: 0 },
  ],
}

/** タイトル行のみのページのフィクスチャ */
const pageTitleOnly = {
  id: "ページID-テスト",
  title: "タイトルのみ",
  lines: [{ id: "行001", text: "タイトルのみ", userId: "u1", created: 0, updated: 0 }],
}

/** previewEditV2 の成功レスポンスフィクスチャ */
const previewSuccessResponse = {
  previewId: "プレビューID-prepend001",
  expireAt: "2026-06-05T12:00:00.000Z",
  pagePreview: {
    title: "テストページ",
    persistent: true,
    lines: [
      { id: "行001", text: "テストページ" },
      { id: "新行001", text: "先頭に挿入する行" },
      { id: "行002", text: "既存の行" },
    ],
  },
}

async function runPrependPreview(args: Record<string, unknown>) {
  await (
    pagePrependPreviewCommand.run as (ctx: {
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

/** PAT 認証と REST クライアントのモックをセットアップするヘルパー。 */
function setupMocks(previewResult = previewSuccessResponse, getPageResult = pageWithBody) {
  requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
  const mockClient = {
    previewEditV2: async () => previewResult,
    getPage: async () => getPageResult,
  }
  buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
    mockClient as unknown as restModule.CosenseRestClient,
  )
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  buildRestClientSpy?.mockRestore()
  requirePatSpy?.mockRestore()
  buildRestClientSpy = undefined
  requirePatSpy = undefined
})

describe("pagePrependPreviewCommand", () => {
  describe("認証エラー", () => {
    it("PAT 以外の認証方式では exit 2 で終了する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockImplementation(async () => {
        process.exit(2)
        throw new Error("AUTH_PAT_REQUIRED")
      })

      try {
        await runPrependPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          line: "先頭行テキスト",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(2)
    })
  })

  describe("バリデーションエラー", () => {
    it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        {} as restModule.CosenseRestClient,
      )

      try {
        await runPrependPreview({
          title: "テストページ",
          project: undefined,
          line: "先頭行テキスト",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--line も --from-file も指定しない場合は CONTENT_REQUIRED で exit 5 になる", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        {} as restModule.CosenseRestClient,
      )

      try {
        await runPrependPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("CONTENT_REQUIRED"))
    })
  })

  describe("成功ケース", () => {
    it("2 行目の lineId をアンカーとして preview リクエストを送信する", async () => {
      // タイトル直後（2 行目）の lineId がアンカーとなること
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedOpts = opts
          return previewSuccessResponse
        },
        getPage: async () => pageWithBody,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runPrependPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "先頭に挿入する行",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      // changes のアンカーが 2 行目 (行002) の lineId であること
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      expect((changes[0] as Record<string, unknown>)["_insert"]).toBe("行002")
    })

    it("タイトル行のみのページでは _end をアンカーとして使う", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedOpts = opts
          return previewSuccessResponse
        },
        getPage: async () => pageTitleOnly,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runPrependPreview({
        title: "タイトルのみ",
        project: "テストプロジェクト",
        line: "本文1行目",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      // タイトル行のみのページでは _end をアンカーとして使うこと
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      expect((changes[0] as Record<string, unknown>)["_insert"]).toBe("_end")
    })

    it("--json フラグで previewId を JSON 出力する", async () => {
      setupMocks()

      await runPrependPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "先頭に挿入する行",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.previewId).toBe("プレビューID-prepend001")
    })
  })
})
