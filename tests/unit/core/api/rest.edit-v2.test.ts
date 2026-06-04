/**
 * rest.edit-v2.test.ts — Cosense v2 ページ編集 AI API (previewEditV2 / submitEditV2) のテスト。
 */

import { beforeEach, describe, expect, it } from "bun:test"
import { CosenseRestClient, ForbiddenError } from "@/core/api/rest"
import { http, HttpResponse } from "msw"
import { useMswServer } from "../../../helpers/msw"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
/** テスト用 PAT フォーマット: pat_ + 64 桁小文字 16 進数 */
const TEST_PAT = `pat_${"a".repeat(64)}`

const PREVIEW_ENDPOINT = `${BASE_URL}/api/pages/v2/${encodeURIComponent(TEST_PROJECT)}/page-edit-for-ai/preview`
const SUBMIT_ENDPOINT = `${BASE_URL}/api/pages/v2/${encodeURIComponent(TEST_PROJECT)}/page-edit-for-ai/submit`

/** previewEditV2 成功レスポンスのフィクスチャ。 */
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

/** submitEditV2 成功レスポンスのフィクスチャ。 */
const submitSuccessResponse = {
  commitId: "コミットID-xyz789",
  page: { title: "テストページ" },
}

const server = useMswServer([
  http.post(PREVIEW_ENDPOINT, ({ request }) => {
    const pat = request.headers.get("x-personal-access-token")
    if (!pat) {
      return HttpResponse.json({ message: "Forbidden" }, { status: 403 })
    }
    return HttpResponse.json(previewSuccessResponse)
  }),

  http.post(SUBMIT_ENDPOINT, ({ request }) => {
    const pat = request.headers.get("x-personal-access-token")
    if (!pat) {
      return HttpResponse.json({ message: "Forbidden" }, { status: 403 })
    }
    return HttpResponse.json(submitSuccessResponse)
  }),
])

describe("CosenseRestClient v2 ページ編集 AI API", () => {
  let client: CosenseRestClient

  beforeEach(() => {
    client = new CosenseRestClient({ personalAccessToken: TEST_PAT })
  })

  describe("previewEditV2", () => {
    it("changes を送信して previewId・expireAt・pagePreview を返す", async () => {
      const result = await client.previewEditV2(TEST_PROJECT, {
        changes: [{ _insert: "_end", lines: { id: "新行001", text: "挿入された行" } }],
      })

      expect(result.previewId).toBe("プレビューID-abc123")
      expect(result.expireAt).toBe("2026-06-04T12:00:00.000Z")
      expect(result.pagePreview?.title).toBe("テストページ")
      expect(result.pagePreview?.lines).toHaveLength(3)
    })

    it("pageId を指定した場合はリクエストボディに含まれる", async () => {
      let capturedBody: unknown = null
      server.use(
        http.post(PREVIEW_ENDPOINT, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(previewSuccessResponse)
        }),
      )

      await client.previewEditV2(TEST_PROJECT, {
        pageId: "ページID-001",
        changes: [{ _delete: "行001" }],
      })

      expect((capturedBody as Record<string, unknown>)["pageId"]).toBe("ページID-001")
    })

    it("pageId を省略した場合はリクエストボディに含まれない（新規ページ用）", async () => {
      let capturedBody: unknown = null
      server.use(
        http.post(PREVIEW_ENDPOINT, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json(previewSuccessResponse)
        }),
      )

      await client.previewEditV2(TEST_PROJECT, {
        changes: [{ _insert: "_end", lines: { id: "行001", text: "タイトル" } }],
      })

      expect((capturedBody as Record<string, unknown>)["pageId"]).toBeUndefined()
    })

    it("PAT なしで呼び出すと ForbiddenError をスローする", async () => {
      const sidClient = new CosenseRestClient({ sid: "dummy-sid" })
      await expect(sidClient.previewEditV2(TEST_PROJECT, { changes: [] })).rejects.toBeInstanceOf(
        ForbiddenError,
      )
    })
  })

  describe("submitEditV2", () => {
    it("previewId を送信して commitId と page.title を返す", async () => {
      const result = await client.submitEditV2(TEST_PROJECT, "プレビューID-abc123")

      expect(result.commitId).toBe("コミットID-xyz789")
      expect(result.page?.title).toBe("テストページ")
    })

    it("PAT なしで呼び出すと ForbiddenError をスローする", async () => {
      const sidClient = new CosenseRestClient({ sid: "dummy-sid" })
      await expect(
        sidClient.submitEditV2(TEST_PROJECT, "プレビューID-abc123"),
      ).rejects.toBeInstanceOf(ForbiddenError)
    })
  })
})
