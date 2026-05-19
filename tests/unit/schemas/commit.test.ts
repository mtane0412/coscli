/**
 * commit.test.ts — commit スキーマの検証テスト。
 *
 * GET /api/commits/:project/:pageid レスポンスの zod スキーマを検証する。
 * - 最初のコミットは parentId が null で返ってくる実 API の挙動に対応する
 * - 通常コミットは parentId が string
 * - parentId を省略したケース (undefined) も有効
 */

import { describe, expect, it } from "bun:test"
import { commitSchema, commitsResponseSchema } from "@/schemas/commit"

describe("commitSchema", () => {
  it("parentId が null のコミットを解析できる (最初のコミット)", () => {
    // 実 API は最初のコミットで parentId: null を返す
    const result = commitSchema.safeParse({
      id: "commit-id-0",
      parentId: null,
      pageId: "page-id-1",
      userId: "user-id-1",
      created: 1700000000,
      kind: "page",
      changes: [],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.parentId).toBeNull()
    }
  })

  it("parentId が string のコミットを解析できる", () => {
    const result = commitSchema.safeParse({
      id: "commit-id-1",
      parentId: "commit-id-0",
      pageId: "page-id-1",
      userId: "user-id-1",
      created: 1700100000,
      kind: "page",
      changes: [],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.parentId).toBe("commit-id-0")
    }
  })

  it("parentId を省略したコミットを解析できる (undefined 扱い)", () => {
    const result = commitSchema.safeParse({
      id: "commit-id-0",
      pageId: "page-id-1",
      userId: "user-id-1",
      created: 1700000000,
      kind: "page",
      changes: [],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.parentId).toBeUndefined()
    }
  })
})

describe("commitsResponseSchema", () => {
  it("parentId が null のコミットを含むレスポンスを解析できる", () => {
    const result = commitsResponseSchema.safeParse({
      commits: [
        {
          id: "commit-id-1",
          parentId: "commit-id-0",
          pageId: "page-id-1",
          userId: "user-id-1",
          created: 1700100000,
          kind: "page",
          changes: [],
        },
        {
          id: "commit-id-0",
          parentId: null,
          pageId: "page-id-1",
          userId: "user-id-1",
          created: 1700000000,
          kind: "page",
          changes: [],
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.commits).toHaveLength(2)
      expect(result.data.commits[1]?.parentId).toBeNull()
    }
  })
})
