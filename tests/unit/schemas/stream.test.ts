/**
 * stream.test.ts — stream スキーマの検証テスト。
 *
 * /api/stream/:projectname/ のレスポンスを検証する。
 * - StreamResponseSchema: プロジェクト更新フィード全体
 * - ProjectUpdatesStreamEventSchema: 7 種の判別共用体
 */

import { describe, expect, it } from "bun:test"
import { ProjectUpdatesStreamEventSchema, StreamResponseSchema } from "@/schemas/stream"

describe("StreamResponseSchema", () => {
  it("最小ペイロード (pages と events が空) をパースできる", () => {
    const result = StreamResponseSchema.parse({
      projectName: "テストプロジェクト",
      end: 1700000000,
      pages: [],
      events: [],
    })
    expect(result.projectName).toBe("テストプロジェクト")
    expect(result.end).toBe(1700000000)
    expect(result.pages).toHaveLength(0)
    expect(result.events).toHaveLength(0)
  })

  it("7 種の event type をすべて含むペイロードをパースできる", () => {
    // 各 event type が正しく discriminatedUnion でパースされることを確認
    const result = StreamResponseSchema.parse({
      projectName: "テストプロジェクト",
      end: 1700000000,
      pages: [
        { id: "ページID-001", title: "テストページ", updated: 1700000000, created: 1699900000 },
      ],
      events: [
        {
          id: "イベントID-001",
          pageId: "ページID-001",
          userId: "ユーザーID-001",
          projectId: "プロジェクトID-001",
          created: 1700000001,
          updated: 1700000001,
          type: "page.delete",
          data: { titleLc: "テストページ" },
        },
        {
          id: "イベントID-002",
          pageId: "ページID-002",
          userId: "ユーザーID-002",
          projectId: "プロジェクトID-001",
          created: 1699990001,
          updated: 1699990001,
          type: "member.join",
        },
        {
          id: "イベントID-003",
          pageId: "ページID-003",
          userId: "ユーザーID-003",
          projectId: "プロジェクトID-001",
          created: 1699980001,
          updated: 1699980001,
          type: "member.add",
        },
        {
          id: "イベントID-004",
          pageId: "ページID-004",
          userId: "ユーザーID-001",
          projectId: "プロジェクトID-001",
          created: 1699970001,
          updated: 1699970001,
          type: "invitation.reset",
        },
        {
          id: "イベントID-005",
          pageId: "ページID-005",
          userId: "ユーザーID-001",
          projectId: "プロジェクトID-001",
          created: 1699960001,
          updated: 1699960001,
          type: "admin.add",
          targetUserId: "ユーザーID-002",
        },
        {
          id: "イベントID-006",
          pageId: "ページID-006",
          userId: "ユーザーID-001",
          projectId: "プロジェクトID-001",
          created: 1699950001,
          updated: 1699950001,
          type: "admin.delete",
          targetUserId: "ユーザーID-003",
        },
        {
          id: "イベントID-007",
          pageId: "ページID-007",
          userId: "ユーザーID-001",
          projectId: "プロジェクトID-001",
          created: 1699940001,
          updated: 1699940001,
          type: "owner.set",
          targetUserId: "ユーザーID-002",
        },
      ],
    })

    expect(result.events).toHaveLength(7)
    const types = result.events.map((e) => e.type)
    expect(types).toContain("page.delete")
    expect(types).toContain("member.join")
    expect(types).toContain("member.add")
    expect(types).toContain("invitation.reset")
    expect(types).toContain("admin.add")
    expect(types).toContain("admin.delete")
    expect(types).toContain("owner.set")
  })

  it("pages の created/updated が省略されたペイロードをパースできる (stream API の実挙動)", () => {
    // 実 API は stream レスポンスの pages[] で created/updated を省略する場合がある
    const result = StreamResponseSchema.safeParse({
      projectName: "テストプロジェクト",
      end: 1700000000,
      pages: [{ id: "ページID-001", title: "テストページ" }],
      events: [],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pages[0]?.created).toBeUndefined()
      expect(result.data.pages[0]?.updated).toBeUndefined()
    }
  })

  it("end が文字列の場合はパースエラーになる", () => {
    expect(() =>
      StreamResponseSchema.parse({
        projectName: "テストプロジェクト",
        end: "not-a-number",
        pages: [],
        events: [],
      }),
    ).toThrow()
  })

  it("projectName が省略された場合はパースエラーになる", () => {
    expect(() =>
      StreamResponseSchema.parse({
        end: 1700000000,
        pages: [],
        events: [],
      }),
    ).toThrow()
  })
})

describe("ProjectUpdatesStreamEventSchema", () => {
  it("未知の type はパースエラーになる (discriminatedUnion の安全性)", () => {
    // 将来追加されうる未知 type が混入しても安全にエラーになることを確認
    expect(() =>
      ProjectUpdatesStreamEventSchema.parse({
        id: "イベントID-001",
        pageId: "ページID-001",
        userId: "ユーザーID-001",
        projectId: "プロジェクトID-001",
        created: 1700000001,
        updated: 1700000001,
        type: "unknown.event",
      }),
    ).toThrow()
  })

  it("page.delete は data.titleLc を含む", () => {
    const result = ProjectUpdatesStreamEventSchema.parse({
      id: "イベントID-001",
      pageId: "ページID-001",
      userId: "ユーザーID-001",
      projectId: "プロジェクトID-001",
      created: 1700000001,
      updated: 1700000001,
      type: "page.delete",
      data: { titleLc: "削除されたページ" },
    })
    expect(result.type).toBe("page.delete")
    if (result.type === "page.delete") {
      expect(result.data.titleLc).toBe("削除されたページ")
    }
  })

  it("admin.add は targetUserId を含む", () => {
    const result = ProjectUpdatesStreamEventSchema.parse({
      id: "イベントID-005",
      pageId: "ページID-005",
      userId: "ユーザーID-001",
      projectId: "プロジェクトID-001",
      created: 1699960001,
      updated: 1699960001,
      type: "admin.add",
      targetUserId: "管理者ユーザーID",
    })
    expect(result.type).toBe("admin.add")
    if (result.type === "admin.add") {
      expect(result.targetUserId).toBe("管理者ユーザーID")
    }
  })
})
