/**
 * preview.test.ts — `cos page edit preview <title>` コマンドのテスト。
 *
 * ops JSON を stdin から受け取り、v2 preview API に送信して previewId を取得する。
 * 認証 (PAT 必須) / プロジェクト未指定 / ops 不正 の各エラーケースを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pageEditPreviewCommand } from "@/commands/page/edit/preview"
import type * as restModule from "@/core/api/rest"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let buildRestClientSpy: ReturnType<typeof spyOn> | undefined
let requirePatSpy: ReturnType<typeof spyOn> | undefined

/** テスト用 PAT フォーマット */
const TEST_PAT = `pat_${"a".repeat(64)}`

/** previewEditV2 の成功レスポンスフィクスチャ */
const previewSuccessResponse = {
  previewId: "プレビューID-abc123",
  expireAt: "2026-06-04T12:00:00.000Z",
  pagePreview: {
    title: "テストページ",
    persistent: true,
    lines: [
      { id: "行001", text: "テストページ" },
      { id: "行002", text: "既存の行" },
      { id: "新行001", text: "挿入された行" },
    ],
  },
}

/** getPage の成功レスポンスフィクスチャ */
const pageResponse = {
  id: "ページID-001",
  title: "テストページ",
  lines: [
    { id: "行001", text: "テストページ", userId: "u1", created: 0, updated: 0 },
    { id: "行002", text: "既存の行", userId: "u1", created: 0, updated: 0 },
  ],
}

async function runPreview(args: Record<string, unknown>) {
  await (
    pageEditPreviewCommand.run as (ctx: {
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

/** PAT 認証と REST クライアントのモックをセットアップするヘルパー。 */
function setupMocks(previewResult = previewSuccessResponse, getPageResult = pageResponse) {
  requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
  const mockClient = {
    previewEditV2: async () => previewResult,
    getPage: async () => getPageResult,
  }
  buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
    mockClient as unknown as restModule.CosenseRestClient,
  )
}

describe("pageEditPreviewCommand", () => {
  describe("認証エラー", () => {
    it("PAT 以外の認証方式の場合は requirePat が exit 2 で終了する", async () => {
      // requirePat が exit 2 を呼ぶことをシミュレート
      requirePatSpy = spyOn(sharedModule, "requirePat").mockImplementation(async () => {
        process.exit(2)
        throw new Error("AUTH_PAT_REQUIRED")
      })

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
          "dry-run": false,
          ops: JSON.stringify({ ops: [] }),
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
        await runPreview({
          title: "テストページ",
          project: undefined,
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
          "dry-run": false,
          ops: JSON.stringify({ ops: [] }),
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("--ops に不正な JSON を渡した場合は exit 5 で終了する", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
          "dry-run": false,
          ops: "不正なJSON{",
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("ops フィールドが配列でない場合は exit 5 で終了する", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          json: false,
          plain: false,
          "results-only": false,
          quiet: false,
          "dry-run": false,
          ops: JSON.stringify({ ops: "配列ではない" }),
        })
      } catch {
        // process.exit モック後の継続 throw は想定内
      }

      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("成功ケース（既存ページ編集）", () => {
    it("--json フラグで previewId・expireAt・status・lines を JSON 出力する", async () => {
      setupMocks()

      await runPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
        "dry-run": false,
        ops: JSON.stringify({
          ops: [{ insertBefore: "_end", text: "挿入された行" }],
        }),
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.previewId).toBe("プレビューID-abc123")
      expect(parsed.data.status).toBe("update")
    })

    it("プレーン出力（非 --json）で previewId を含むテキストを出力する", async () => {
      setupMocks()

      await runPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
        "dry-run": false,
        ops: JSON.stringify({
          ops: [{ insertBefore: "_end", text: "挿入された行" }],
        }),
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      expect(output).toContain("プレビューID-abc123")
    })
  })

  describe("成功ケース（新規ページ作成）", () => {
    it("--new フラグで pageId なしの preview リクエストを送信する", async () => {
      const newPageResponse = {
        previewId: "新規プレビューID",
        expireAt: "2026-06-04T12:00:00.000Z",
        // persistent: false は新規ページを示す
        pagePreview: { title: "新しいページ", persistent: false, lines: [] },
      }
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedOpts = opts
          return newPageResponse
        },
        getPage: async () => pageResponse,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runPreview({
        title: "新しいページ",
        project: "テストプロジェクト",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
        "dry-run": false,
        new: true,
        body: "本文1行目\n本文2行目",
      })

      expect(exitMock).not.toHaveBeenCalled()
      // 新規ページなので pageId が渡されない
      expect((capturedOpts as Record<string, unknown>)["pageId"]).toBeUndefined()

      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.status).toBe("create")
    })
  })
})
