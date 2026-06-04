/**
 * submit.test.ts — `cos page edit submit <previewId>` コマンドのテスト。
 *
 * previewId を v2 submit API に送信して確定コミットを実行する。
 * 認証 (PAT 必須) / プロジェクト未指定 の各エラーケースを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pageEditSubmitCommand } from "@/commands/page/edit/submit"
import type * as restModule from "@/core/api/rest"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let buildRestClientSpy: ReturnType<typeof spyOn> | undefined
let requirePatSpy: ReturnType<typeof spyOn> | undefined

/** テスト用 PAT フォーマット */
const TEST_PAT = `pat_${"a".repeat(64)}`

/** submitEditV2 の成功レスポンスフィクスチャ */
const submitSuccessResponse = {
  commitId: "コミットID-xyz789",
  page: { title: "テストページ" },
}

async function runSubmit(args: Record<string, unknown>) {
  await (
    pageEditSubmitCommand.run as (ctx: {
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
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  buildRestClientSpy?.mockRestore()
  requirePatSpy?.mockRestore()
  buildRestClientSpy = undefined
  requirePatSpy = undefined
})

/** PAT 認証と REST クライアントのモックをセットアップするヘルパー。 */
function setupMocks(
  submitResult: { commitId: string; page: { title?: string } | null } = submitSuccessResponse,
) {
  requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
  const mockClient = {
    submitEditV2: async () => submitResult,
  }
  buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
    mockClient as unknown as restModule.CosenseRestClient,
  )
}

describe("pageEditSubmitCommand", () => {
  describe("認証エラー", () => {
    it("PAT 以外の認証方式の場合は requirePat が exit 2 で終了する", async () => {
      requirePatSpy = spyOn(sharedModule, "requirePat").mockImplementation(async () => {
        process.exit(2)
        throw new Error("AUTH_PAT_REQUIRED")
      })

      try {
        await runSubmit({
          previewId: "プレビューID-abc123",
          project: "テストプロジェクト",
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
        await runSubmit({
          previewId: "プレビューID-abc123",
          project: undefined,
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
    it("--json フラグで commitId・title を JSON 出力する", async () => {
      setupMocks()

      await runSubmit({
        previewId: "プレビューID-abc123",
        project: "テストプロジェクト",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      const parsed = JSON.parse(output)
      expect(parsed.data.commitId).toBe("コミットID-xyz789")
      expect(parsed.data.title).toBe("テストページ")
    })

    it("プレーン出力（非 --json）で commitId を含むテキストを出力する", async () => {
      setupMocks()

      await runSubmit({
        previewId: "プレビューID-abc123",
        project: "テストプロジェクト",
        json: false,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
      const output = (stdoutMock.mock.calls[0]?.[0] as string) ?? ""
      expect(output).toContain("コミットID-xyz789")
      expect(output).toContain("テストページ")
    })

    it("page.title が null の場合も正常終了する", async () => {
      setupMocks({ commitId: "コミットID-xyz789", page: null })

      await runSubmit({
        previewId: "プレビューID-abc123",
        project: "テストプロジェクト",
        json: true,
        plain: false,
        "results-only": false,
        quiet: false,
      })

      expect(exitMock).not.toHaveBeenCalled()
    })
  })
})
