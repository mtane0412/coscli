/**
 * page/line/replace.test.ts — `cos page line replace preview <title>` コマンドのテスト。
 *
 * v2 AI ops API (PAT 必須) を使って指定行を置換する preview コマンドを検証する。
 * 単一行置換のみサポート。改行入りテキストは INVALID_OPS で拒否される。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pageLineReplacePreviewCommand } from "@/commands/page/line/replace/preview"
import type * as restModule from "@/core/api/rest"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let buildRestClientSpy: ReturnType<typeof spyOn> | undefined
let requirePatSpy: ReturnType<typeof spyOn> | undefined

/** テスト用 PAT フォーマット */
const TEST_PAT = `pat_${"a".repeat(64)}`

/** 3 行のページフィクスチャ (タイトル + 2 本文行) */
const pageWith3Lines = {
  id: "ページID-テスト",
  title: "テストページ",
  lines: [
    { id: "行001", text: "テストページ", userId: "u1", created: 0, updated: 0 },
    { id: "行002", text: "1行目の内容", userId: "u1", created: 0, updated: 0 },
    { id: "行003", text: "2行目の内容", userId: "u1", created: 0, updated: 0 },
  ],
}

/** previewEditV2 の成功レスポンスフィクスチャ */
const previewSuccessResponse = {
  previewId: "プレビューID-line-replace001",
  expireAt: "2026-06-05T12:00:00.000Z",
  pagePreview: {
    title: "テストページ",
    persistent: true,
    lines: [
      { id: "行001", text: "テストページ" },
      { id: "行002", text: "置換後のテキスト" },
      { id: "行003", text: "2行目の内容" },
    ],
  },
}

async function runLineReplacePreview(args: Record<string, unknown>) {
  await (
    pageLineReplacePreviewCommand.run as (ctx: {
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
function setupMocks(previewResult = previewSuccessResponse, getPageResult = pageWith3Lines) {
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

describe("pageLineReplacePreviewCommand", () => {
  describe("認証エラー", () => {
    it("PAT 以外の認証方式では exit 2 で終了する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockImplementation(async () => {
        process.exit(2)
        throw new Error("AUTH_PAT_REQUIRED")
      })

      try {
        await runLineReplacePreview({
          title: "テストページ",
          project: "テストプロジェクト",
          line: "2",
          text: "置換後のテキスト",
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
        await runLineReplacePreview({
          title: "テストページ",
          project: undefined,
          line: "2",
          text: "置換後のテキスト",
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

    it("--line と --text が未指定の場合は VALIDATION_ERROR で exit 5 になる", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        {} as restModule.CosenseRestClient,
      )

      try {
        await runLineReplacePreview({
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
    })

    it("--text に改行を含むテキストを渡すと INVALID_OPS で exit 5 になる", async () => {
      // v2 API の _update op は改行を含むテキストに対応しないため
      setupMocks()

      try {
        await runLineReplacePreview({
          title: "テストページ",
          project: "テストプロジェクト",
          line: "2",
          text: "行1\n行2",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("INVALID_OPS"))
    })
  })

  describe("成功ケース", () => {
    it("--line 2 で 2 行目の lineId を使って _update change を送信する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedOpts = opts
          return previewSuccessResponse
        },
        getPage: async () => pageWith3Lines,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runLineReplacePreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "2",
        text: "置換後のテキスト",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      // _update change が生成されていること
      expect((changes[0] as Record<string, unknown>)["_update"]).toBe("行002")
      expect(
        ((changes[0] as Record<string, unknown>)["lines"] as Record<string, unknown>)["text"],
      ).toBe("置換後のテキスト")
    })

    it("--json フラグで previewId を JSON 出力する", async () => {
      setupMocks()

      await runLineReplacePreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "2",
        text: "置換後のテキスト",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.previewId).toBe("プレビューID-line-replace001")
    })
  })
})
