/**
 * page/new.test.ts — `cos page new preview <title>` コマンドのテスト。
 *
 * v2 AI ops API (PAT 必須) を使って新しいページを作成する preview コマンドを検証する。
 * タイトルと本文を `insertBefore: "_end"` ops に変換して新規ページを作成する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pageNewPreviewCommand } from "@/commands/page/new/preview"
import type * as restModule from "@/core/api/rest"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let buildRestClientSpy: ReturnType<typeof spyOn> | undefined
let requirePatSpy: ReturnType<typeof spyOn> | undefined

/** テスト用 PAT フォーマット */
const TEST_PAT = `pat_${"a".repeat(64)}`

/** previewEditV2 の新規ページ作成レスポンスフィクスチャ */
const newPagePreviewResponse = {
  previewId: "プレビューID-new001",
  expireAt: "2026-06-05T12:00:00.000Z",
  // persistent: false は新規ページ作成を示す
  pagePreview: {
    title: "新しいページ",
    persistent: false,
    lines: [
      { id: "新行001", text: "新しいページ" },
      { id: "新行002", text: "本文1行目" },
    ],
  },
}

async function runNewPreview(args: Record<string, unknown>) {
  await (
    pageNewPreviewCommand.run as (ctx: {
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
function setupMocks(previewResult = newPagePreviewResponse) {
  requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
  const mockClient = {
    previewEditV2: async () => previewResult,
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

describe("pageNewPreviewCommand", () => {
  describe("認証エラー", () => {
    it("PAT 以外の認証方式では exit 2 で終了する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockImplementation(async () => {
        process.exit(2)
        throw new Error("AUTH_PAT_REQUIRED")
      })

      try {
        await runNewPreview({
          title: "新しいページ",
          project: "テストプロジェクト",
          line: "本文1行目",
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
        await runNewPreview({
          title: "新しいページ",
          project: undefined,
          line: "本文1行目",
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
        await runNewPreview({
          title: "新しいページ",
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
    it("タイトルと本文から pageId なしの preview リクエストを送信する", async () => {
      // 新規ページ作成なので pageId が渡されないこと
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedOpts = opts
          return newPagePreviewResponse
        },
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runNewPreview({
        title: "新しいページ",
        project: "テストプロジェクト",
        line: "本文1行目",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      // 新規ページなので pageId が undefined であること
      expect((capturedOpts as Record<string, unknown>)["pageId"]).toBeUndefined()
      // changes の最初の行がタイトル (insertBefore: "_end") であること
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      expect(changes.length).toBeGreaterThan(0)
      expect((changes[0] as Record<string, unknown>)["_insert"]).toBe("_end")
    })

    it("--json フラグで previewId と status: 'create' を JSON 出力する", async () => {
      setupMocks()

      await runNewPreview({
        title: "新しいページ",
        project: "テストプロジェクト",
        line: "本文1行目",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.previewId).toBe("プレビューID-new001")
      // persistent: false なので status: "create" になること
      expect(parsed.data.status).toBe("create")
    })

    it("--line に複数行を渡すと全行が changes に含まれる", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedOpts = opts
          return newPagePreviewResponse
        },
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runNewPreview({
        title: "複数行テストページ",
        project: "テストプロジェクト",
        line: "行1\n行2\n行3",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      // タイトル + 3 行 = 4 行分の changes があること
      expect(changes).toHaveLength(4)
    })

    it("プレーン出力で previewId を含むテキストを出力する", async () => {
      setupMocks()

      await runNewPreview({
        title: "新しいページ",
        project: "テストプロジェクト",
        line: "本文1行目",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      expect(output).toContain("プレビューID-new001")
    })
  })
})
