/**
 * ai-page.test.ts — AI向けページMarkdown生成のテスト。
 *
 * formatAiPage 関数が Page + ProjectMembersResponse から
 * エージェントが読みやすい Markdown を正しく生成することを検証する。
 */

import { describe, expect, it } from "bun:test"
import { formatAiPage } from "@/core/format/ai-page"
import type { Page } from "@/schemas/page"
import type { ProjectMembersResponse } from "@/schemas/project"

/** テスト用の最小 Page オブジェクト */
const BASE_PAGE: Page = {
  id: "page-id-abc123",
  title: "テストページ",
  created: 1700000000,
  updated: 1700100000,
  views: 42,
  linked: 5,
  commitId: "commit-xyz",
  lines: [
    // lines[0] はタイトル行（本文出力から除外される）
    {
      id: "line0",
      text: "テストページ",
      userId: "user-山田",
      created: 1700000000,
      updated: 1700000000,
    },
    {
      id: "line1",
      text: "本文の1行目です",
      userId: "user-山田",
      created: 1700000000,
      updated: 1700050000,
    },
    {
      id: "line2",
      text: "本文の2行目です",
      userId: "user-鈴木",
      created: 1700000000,
      updated: 1700100000,
    },
  ],
  user: { id: "user-山田", name: "yamada", displayName: "山田太郎" },
  relatedPages: {
    links1hop: [
      { id: "rel1", title: "関連ページA", created: 1700000000, updated: 1700000000 },
      { id: "rel2", title: "関連ページB", created: 1700000000, updated: 1700000000 },
    ],
  },
}

/** テスト用のメンバーレスポンス */
const MEMBERS: ProjectMembersResponse = {
  users: [
    { id: "user-山田", name: "yamada", displayName: "山田太郎", created: 0, updated: 0 },
    { id: "user-鈴木", name: "suzuki", displayName: "鈴木次郎", created: 0, updated: 0 },
  ],
}

describe("formatAiPage", () => {
  it("出力の先頭がページタイトルの # 見出しになる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    expect(output).toMatch(/^# テストページ\n/)
  })

  it("メタデータセクションに pageId が含まれる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    expect(output).toContain("page-id-abc123")
  })

  it("メタデータセクションに commitId が含まれる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    expect(output).toContain("commit-xyz")
  })

  it("メタデータセクションに views が含まれる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    expect(output).toContain("42")
  })

  it("メタデータセクションに被リンク数が含まれる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    expect(output).toContain("5")
  })

  it("編集メンバーセクションにアイコン記法が含まれる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    // テロメアに登場した山田・鈴木のアイコン記法が出力される
    expect(output).toContain("[yamada.icon]")
    expect(output).toContain("[suzuki.icon]")
  })

  it("テロメアセクションにユーザー名・行数が含まれる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    expect(output).toContain("山田太郎")
    expect(output).toContain("鈴木次郎")
  })

  it("本文セクションに lines[1] 以降のテキストが含まれる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    expect(output).toContain("本文の1行目です")
    expect(output).toContain("本文の2行目です")
  })

  it("本文セクションに lines[0]（タイトル行）は含まれない", () => {
    // タイトル行のテキストは # 見出しとして既出のため本文ブロックには含まない
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    // 本文セクション (## 本文) 以降のテキスト部分にタイトル行が重複しない
    const bodySection = output.split("## 本文")[1] ?? ""
    const firstLine = bodySection.trimStart().split("\n")[0]
    expect(firstLine).not.toBe("テストページ")
  })

  it("1-hop関連ページセクションにページタイトルが含まれる", () => {
    const output = formatAiPage(BASE_PAGE, MEMBERS)
    expect(output).toContain("関連ページA")
    expect(output).toContain("関連ページB")
  })

  it("1-hop関連ページがない場合、関連ページセクションは出力されない", () => {
    const page: Page = { ...BASE_PAGE, relatedPages: undefined }
    const output = formatAiPage(page, MEMBERS)
    expect(output).not.toContain("関連ページ")
  })

  it("メンバー情報が null の場合もエラーなく出力できる", () => {
    expect(() => formatAiPage(BASE_PAGE, null)).not.toThrow()
    const output = formatAiPage(BASE_PAGE, null)
    expect(output).toContain("# テストページ")
  })
})
