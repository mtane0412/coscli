/**
 * page/insert.test.ts — `cos page insert preview <title>` コマンドのテスト。
 *
 * v2 AI ops API (PAT 必須) を使って指定行の後ろに行を挿入する
 * preview コマンドを検証する。
 * --after (1-indexed 行番号) と --after-id (lineId 直接指定) の両方に対応する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pageInsertPreviewCommand } from "@/commands/page/insert/preview"
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
  previewId: "プレビューID-insert001",
  expireAt: "2026-06-05T12:00:00.000Z",
  pagePreview: {
    title: "テストページ",
    persistent: true,
    lines: [
      { id: "行001", text: "テストページ" },
      { id: "行002", text: "1行目の内容" },
      { id: "新行001", text: "挿入する行" },
      { id: "行003", text: "2行目の内容" },
    ],
  },
}

async function runInsertPreview(args: Record<string, unknown>) {
  await (
    pageInsertPreviewCommand.run as (ctx: {
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

describe("pageInsertPreviewCommand", () => {
  describe("認証エラー", () => {
    it("PAT 以外の認証方式では exit 2 で終了する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockImplementation(async () => {
        process.exit(2)
        throw new Error("AUTH_PAT_REQUIRED")
      })

      try {
        await runInsertPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          after: "2",
          line: "挿入する行",
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
        await runInsertPreview({
          title: "テストページ",
          project: undefined,
          after: "2",
          line: "挿入する行",
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

    it("--after も --after-id も指定しない場合は VALIDATION_ERROR で exit 5 になる（空文字エラーではなく）", async () => {
      // 両フラグ未指定時に "--after の値が無効です: ''" という誤解を招くメッセージを出さないこと
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        {} as restModule.CosenseRestClient,
      )

      try {
        await runInsertPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          // after も after-id も渡さない
          line: "挿入する行",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      // 空文字エラーではなく「どちらかを指定して」というメッセージであること
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      expect(output).toContain("VALIDATION_ERROR")
      expect(output).not.toContain('""')
      expect(output).toContain("after-id")
    })

    it("--after に数値以外を指定した場合は VALIDATION_ERROR で exit 5 になる", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        {} as restModule.CosenseRestClient,
      )

      try {
        await runInsertPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          after: "abc",
          line: "挿入する行",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
    })

    it("--after に 0 を指定した場合は VALIDATION_ERROR で exit 5 になる", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        {} as restModule.CosenseRestClient,
      )

      try {
        await runInsertPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          after: "0",
          line: "挿入する行",
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

    it("--after にページ行数を超える値を指定した場合は VALIDATION_ERROR で exit 5 になる", async () => {
      // pageWith3Lines は 3 行なので --after 4 以上は範囲外
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      const mockClient = {
        previewEditV2: async () => previewSuccessResponse,
        getPage: async () => pageWith3Lines,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      try {
        await runInsertPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          after: "4",
          line: "挿入する行",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
      expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
    })

    it("--line も --from-file も指定しない場合は CONTENT_REQUIRED で exit 5 になる", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        {} as restModule.CosenseRestClient,
      )

      try {
        await runInsertPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          after: "2",
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

  describe("成功ケース (--after 行番号指定)", () => {
    it("--after 2 で 2 行目の次行 (3 行目) の lineId をアンカーとして送信する", async () => {
      // ページの 2 行目の後ろに挿入するため、3 行目 (行003) がアンカーになること
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

      await runInsertPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        after: "2",
        line: "挿入する行",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      // --after 2 なので lines[2] = 行003 がアンカーになること (0-indexed: lines[after])
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      expect((changes[0] as Record<string, unknown>)["_insert"]).toBe("行003")
    })

    it("最終行 (--after 3) の後ろへの挿入は _end をアンカーとして使う", async () => {
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

      await runInsertPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        after: "3",
        line: "最終行の後ろに挿入",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      // 最終行への挿入なので _end になること
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      expect((changes[0] as Record<string, unknown>)["_insert"]).toBe("_end")
    })
  })

  describe("成功ケース (--after-id lineId 直接指定)", () => {
    it("--after-id でアンカー lineId を直接指定して送信する", async () => {
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

      await runInsertPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        "after-id": "行003",
        line: "指定 lineId の直前に挿入",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      // --after-id で指定した lineId がアンカーとして使われること
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      expect((changes[0] as Record<string, unknown>)["_insert"]).toBe("行003")
    })
  })

  describe("JSON / プレーン出力", () => {
    it("--json フラグで previewId を JSON 出力する", async () => {
      setupMocks()

      await runInsertPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        after: "2",
        line: "挿入する行",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.previewId).toBe("プレビューID-insert001")
    })
  })
})
