/**
 * page/line/delete.test.ts — `cos page line delete preview <title>` コマンドのテスト。
 *
 * v2 AI ops API (PAT 必須) を使って指定行または行範囲を削除する
 * preview コマンドを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pageLineDeletePreviewCommand } from "@/commands/page/line/delete/preview"
import type * as restModule from "@/core/api/rest"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let buildRestClientSpy: ReturnType<typeof spyOn> | undefined
let requirePatSpy: ReturnType<typeof spyOn> | undefined

/** テスト用 PAT フォーマット */
const TEST_PAT = `pat_${"a".repeat(64)}`

/** 4 行のページフィクスチャ (タイトル + 3 本文行) */
const pageWith4Lines = {
  id: "ページID-テスト",
  title: "テストページ",
  lines: [
    { id: "行001", text: "テストページ", userId: "u1", created: 0, updated: 0 },
    { id: "行002", text: "1行目の内容", userId: "u1", created: 0, updated: 0 },
    { id: "行003", text: "2行目の内容", userId: "u1", created: 0, updated: 0 },
    { id: "行004", text: "3行目の内容", userId: "u1", created: 0, updated: 0 },
  ],
}

/** previewEditV2 の成功レスポンスフィクスチャ */
const previewSuccessResponse = {
  previewId: "プレビューID-line-delete001",
  expireAt: "2026-06-05T12:00:00.000Z",
  pagePreview: {
    title: "テストページ",
    persistent: true,
    lines: [
      { id: "行001", text: "テストページ" },
      { id: "行003", text: "2行目の内容" },
      { id: "行004", text: "3行目の内容" },
    ],
  },
}

async function runLineDeletePreview(args: Record<string, unknown>) {
  await (
    pageLineDeletePreviewCommand.run as (ctx: {
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
function setupMocks(previewResult = previewSuccessResponse, getPageResult = pageWith4Lines) {
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

describe("pageLineDeletePreviewCommand", () => {
  describe("認証エラー", () => {
    it("PAT 以外の認証方式では exit 2 で終了する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockImplementation(async () => {
        process.exit(2)
        throw new Error("AUTH_PAT_REQUIRED")
      })

      try {
        await runLineDeletePreview({
          title: "テストページ",
          project: "テストプロジェクト",
          line: "2",
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
        await runLineDeletePreview({
          title: "テストページ",
          project: undefined,
          line: "2",
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

    it("--line も --range も指定しない場合は VALIDATION_ERROR で exit 5 になる", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        {} as restModule.CosenseRestClient,
      )

      try {
        await runLineDeletePreview({
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
  })

  describe("成功ケース", () => {
    it("--line 2 で 2 行目の lineId を _delete change に変換して送信する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedOpts = opts
          return previewSuccessResponse
        },
        getPage: async () => pageWith4Lines,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runLineDeletePreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "2",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      // _delete change が生成されていること
      expect(changes).toHaveLength(1)
      expect((changes[0] as Record<string, unknown>)["_delete"]).toBe("行002")
    })

    it("--range 2:3 で 2〜3 行目の lineId をまとめて _delete change に変換する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedOpts = opts
          return previewSuccessResponse
        },
        getPage: async () => pageWith4Lines,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runLineDeletePreview({
        title: "テストページ",
        project: "テストプロジェクト",
        range: "2:3",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      // 2〜3 行目の 2 行分の _delete change が生成されること
      expect(changes).toHaveLength(2)
      expect((changes[0] as Record<string, unknown>)["_delete"]).toBe("行002")
      expect((changes[1] as Record<string, unknown>)["_delete"]).toBe("行003")
    })

    it("--json フラグで previewId を JSON 出力する", async () => {
      setupMocks()

      await runLineDeletePreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "2",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.previewId).toBe("プレビューID-line-delete001")
    })
  })
})
