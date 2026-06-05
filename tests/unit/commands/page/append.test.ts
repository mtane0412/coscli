/**
 * page/append.test.ts — `cos page append preview <title>` コマンドのテスト。
 *
 * v2 AI ops API (PAT 必須) を使ってページ末尾に行を追加する preview コマンドを検証する。
 * PAT 認証 / プロジェクト未指定 / コンテンツ未指定 のエラーケース、および成功ケースを網羅する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pageAppendPreviewCommand } from "@/commands/page/append/preview"
import type * as restModule from "@/core/api/rest"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let buildRestClientSpy: ReturnType<typeof spyOn> | undefined
let requirePatSpy: ReturnType<typeof spyOn> | undefined

/** テスト用 PAT フォーマット */
const TEST_PAT = `pat_${"a".repeat(64)}`

/** getPage の成功レスポンスフィクスチャ */
const pageResponse = {
  id: "ページID-テスト",
  title: "テストページ",
  lines: [
    { id: "行001", text: "テストページ", userId: "u1", created: 0, updated: 0 },
    { id: "行002", text: "既存の行", userId: "u1", created: 0, updated: 0 },
  ],
}

/** previewEditV2 の成功レスポンスフィクスチャ */
const previewSuccessResponse = {
  previewId: "プレビューID-append001",
  expireAt: "2026-06-05T12:00:00.000Z",
  pagePreview: {
    title: "テストページ",
    persistent: true,
    lines: [
      { id: "行001", text: "テストページ" },
      { id: "行002", text: "既存の行" },
      { id: "新行001", text: "追加する行" },
    ],
  },
}

async function runAppendPreview(args: Record<string, unknown>) {
  await (
    pageAppendPreviewCommand.run as (ctx: {
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

describe("pageAppendPreviewCommand", () => {
  describe("認証エラー", () => {
    it("PAT 以外の認証方式では requirePat が exit 2 で終了する", async () => {
      // SID ユーザーが append preview を試みると AUTH_PAT_REQUIRED で弾かれること
      requirePatSpy = spyOn(sharedModule, "requirePat").mockImplementation(async () => {
        process.exit(2)
        throw new Error("AUTH_PAT_REQUIRED")
      })

      try {
        await runAppendPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          line: "追記行テキスト",
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
        await runAppendPreview({
          title: "テストページ",
          project: undefined,
          line: "追記行テキスト",
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
        await runAppendPreview({
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
    it("--line で指定したテキストを末尾に追加する preview リクエストを送信する", async () => {
      // previewEditV2 に渡された引数をキャプチャして検証する
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedProject = ""
      let capturedOpts: unknown = null
      const mockClient = {
        previewEditV2: async (project: string, opts: unknown) => {
          capturedProject = project
          capturedOpts = opts
          return previewSuccessResponse
        },
        getPage: async () => pageResponse,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runAppendPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "追加する行",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      expect(capturedProject).toBe("テストプロジェクト")
      // pageId が正しく渡されていること
      expect((capturedOpts as Record<string, unknown>)["pageId"]).toBe("ページID-テスト")
      // changes に _insert: "_end" が含まれていること
      const changes = (capturedOpts as Record<string, unknown>)["changes"] as unknown[]
      expect(changes.length).toBeGreaterThan(0)
      expect((changes[0] as Record<string, unknown>)["_insert"]).toBe("_end")
    })

    it("--json フラグで previewId・expireAt・status を JSON 出力する", async () => {
      setupMocks()

      await runAppendPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "追加する行",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.previewId).toBe("プレビューID-append001")
      expect(parsed.data.status).toBe("update")
    })

    it("プレーン出力で previewId を含むテキストを出力する", async () => {
      setupMocks()

      await runAppendPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "追加する行",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      expect(output).toContain("プレビューID-append001")
    })

    it("--line に実改行を含む文字列を渡すと複数行が _end に挿入される", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
      let capturedChanges: unknown[] = []
      const mockClient = {
        previewEditV2: async (_project: string, opts: unknown) => {
          capturedChanges = (opts as Record<string, unknown>)["changes"] as unknown[]
          return previewSuccessResponse
        },
        getPage: async () => pageResponse,
      }
      buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
        mockClient as unknown as restModule.CosenseRestClient,
      )

      await runAppendPreview({
        title: "テストページ",
        project: "テストプロジェクト",
        line: "追記行A\n追記行B",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      // 改行で分割されて 2 つの _insert: "_end" change が生成されること
      expect(capturedChanges).toHaveLength(2)
      expect((capturedChanges[0] as Record<string, unknown>)["_insert"]).toBe("_end")
      expect((capturedChanges[1] as Record<string, unknown>)["_insert"]).toBe("_end")
    })
  })
})
