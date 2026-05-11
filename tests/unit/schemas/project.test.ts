/**
 * project.test.ts — project スキーマの検証テスト。
 *
 * 実 API レスポンスとの整合性を検証する。
 * - ProjectSchema: /api/projects/:project のレスポンス
 * - ProjectListResponseSchema: /api/projects のレスポンス
 */

import { describe, expect, it } from "bun:test"
import { ProjectSchema } from "@/schemas/project"

describe("ProjectSchema — 実 API レスポンスとの整合性", () => {
  it("plan が null でもパースできる", () => {
    // 実 API: 有料プランに入っていないプロジェクトは plan: null を返す
    const result = ProjectSchema.parse({
      id: "プロジェクトID-001",
      name: "テストプロジェクト",
      displayName: "テスト表示名",
      publicVisible: true,
      plan: null,
      created: 1700000000,
      updated: 1700100000,
    })
    expect(result.name).toBe("テストプロジェクト")
    expect(result.plan).toBeNull()
  })

  it("plan が文字列でもパースできる", () => {
    const result = ProjectSchema.parse({
      id: "プロジェクトID-002",
      name: "有料プロジェクト",
      displayName: "有料表示名",
      publicVisible: false,
      plan: "business",
      created: 1700000000,
      updated: 1700100000,
    })
    expect(result.plan).toBe("business")
  })

  it("plan フィールド自体が省略されてもパースできる", () => {
    const result = ProjectSchema.parse({
      id: "プロジェクトID-003",
      name: "プランなしプロジェクト",
      displayName: "プランなし表示名",
      publicVisible: true,
      created: 1700000000,
      updated: 1700100000,
    })
    expect(result.plan).toBeUndefined()
  })
})
