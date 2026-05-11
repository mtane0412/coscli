/**
 * page.test.ts — page スキーマの検証テスト。
 *
 * 実 API レスポンスとの整合性を検証する。
 * - TitleSearchResultSchema: /api/pages/:project/search/titles
 * - PageSummarySchema: /api/pages/:project の pages[] 要素
 * - PageSchema: /api/pages/:project/:title の個別ページ
 * - SearchResultSchema: /api/pages/:project/search/query
 */

import { describe, expect, it } from "bun:test"
import {
  PageSchema,
  PageSummarySchema,
  SearchResultSchema,
  TitleSearchResultSchema,
} from "@/schemas/page"

describe("TitleSearchResultSchema", () => {
  it("id・title・updated の最小フィールドを解析できる", () => {
    const result = TitleSearchResultSchema.parse({
      id: "page-id-1",
      title: "ホームページ",
      updated: 1700000000,
    })
    expect(result.id).toBe("page-id-1")
    expect(result.title).toBe("ホームページ")
    expect(result.updated).toBe(1700000000)
  })

  it("links フィールド (string[]) を含むオブジェクトを解析できる", () => {
    const result = TitleSearchResultSchema.parse({
      id: "page-id-2",
      title: "リンク元ページ",
      updated: 1700000001,
      links: ["リンク先A", "リンク先B"],
    })
    expect(result.links).toEqual(["リンク先A", "リンク先B"])
  })

  it("image フィールド (string) を含むオブジェクトを解析できる", () => {
    const result = TitleSearchResultSchema.parse({
      id: "page-id-3",
      title: "画像付きページ",
      updated: 1700000002,
      image: "https://scrapbox.io/files/example.png",
    })
    expect(result.image).toBe("https://scrapbox.io/files/example.png")
  })

  it("links と image を両方含むオブジェクトを解析できる", () => {
    const result = TitleSearchResultSchema.parse({
      id: "page-id-4",
      title: "フルページ",
      updated: 1700000003,
      links: ["タグ/TypeScript", "お知らせ"],
      image: "https://scrapbox.io/files/thumb.png",
      exists: true,
    })
    expect(result.links).toEqual(["タグ/TypeScript", "お知らせ"])
    expect(result.image).toBe("https://scrapbox.io/files/thumb.png")
    expect(result.exists).toBe(true)
  })

  it("links が空配列のオブジェクトを解析できる", () => {
    const result = TitleSearchResultSchema.parse({
      id: "page-id-5",
      title: "リンクなしページ",
      updated: 1700000004,
      links: [],
    })
    expect(result.links).toEqual([])
  })

  it("余分なフィールドはストリップされる", () => {
    const result = TitleSearchResultSchema.parse({
      id: "page-id-6",
      title: "ページ",
      updated: 1700000005,
      links: [],
      unknownField: "値",
    })
    // @ts-expect-error 未定義フィールド
    expect(result.unknownField).toBeUndefined()
  })

  it("image が null の場合も解析できる", () => {
    const result = TitleSearchResultSchema.parse({
      id: "page-id-7",
      title: "画像なしページ",
      updated: 1700000006,
      image: null,
    })
    expect(result.image).toBeNull()
  })

  it("必須フィールド (id) が欠落している場合はエラーをスローする", () => {
    expect(() =>
      TitleSearchResultSchema.parse({
        title: "IDなしページ",
        updated: 1700000007,
      }),
    ).toThrow()
  })

  it("links の要素が文字列でない場合はエラーをスローする", () => {
    expect(() =>
      TitleSearchResultSchema.parse({
        id: "page-id-8",
        title: "不正リンクページ",
        updated: 1700000008,
        links: [123, "正常タイトル"],
      }),
    ).toThrow()
  })
})

describe("PageSummarySchema — 実 API レスポンスとの整合性", () => {
  it("user が id のみ (name/displayName 欠落) でもパースできる", () => {
    // 実 API: user オブジェクトは id だけを返す場合がある
    const result = PageSummarySchema.parse({
      id: "ページID-001",
      title: "テストページ",
      user: { id: "ユーザーID-001" },
      created: 1700000000,
      updated: 1700100000,
    })
    expect(result.id).toBe("ページID-001")
    expect(result.user?.id).toBe("ユーザーID-001")
    expect(result.user?.name).toBeUndefined()
    expect(result.user?.displayName).toBeUndefined()
  })

  it("user フィールド自体が省略されてもパースできる", () => {
    const result = PageSummarySchema.parse({
      id: "ページID-002",
      title: "ユーザー情報なしページ",
      created: 1700000000,
      updated: 1700100000,
    })
    expect(result.user).toBeUndefined()
  })
})

describe("PageSchema — 実 API レスポンスとの整合性", () => {
  it("commitId が省略されてもパースできる", () => {
    // 実 API: 新規作成直後のページは commitId が無いことがある
    const result = PageSchema.parse({
      id: "ページID-003",
      title: "新規作成ページ",
      user: { id: "ユーザーID-001" },
      created: 1700000000,
      updated: 1700100000,
      lines: [
        {
          id: "行ID-001",
          text: "新規作成ページ",
          userId: "ユーザーID-001",
          created: 1700000000,
          updated: 1700000000,
        },
      ],
    })
    expect(result.commitId).toBeUndefined()
  })

  it("user に name/displayName が無くてもパースできる", () => {
    const result = PageSchema.parse({
      id: "ページID-004",
      title: "ユーザー情報省略ページ",
      user: { id: "ユーザーID-002" },
      commitId: "コミットID-001",
      created: 1700000000,
      updated: 1700100000,
      lines: [
        {
          id: "行ID-001",
          text: "ユーザー情報省略ページ",
          userId: "ユーザーID-002",
          created: 1700000000,
          updated: 1700000000,
        },
      ],
    })
    expect(result.user?.name).toBeUndefined()
    expect(result.user?.displayName).toBeUndefined()
  })
})

describe("SearchResultSchema — 実 API レスポンスとの整合性", () => {
  it("query フィールドがオブジェクトでもパースできる", () => {
    // 実 API (認証あり): query は { words: [...], excludes: [...] } 形式のオブジェクトを返す
    const result = SearchResultSchema.parse({
      query: { words: ["テスト"], excludes: [] },
      pages: [],
      projectName: "テストプロジェクト",
    })
    expect(result.projectName).toBe("テストプロジェクト")
  })

  it("query フィールドが文字列でもパースできる", () => {
    const result = SearchResultSchema.parse({
      query: "テスト",
      pages: [],
      projectName: "テストプロジェクト",
    })
    expect(result.query).toBe("テスト")
  })

  it("search の pages 要素に lines フィールドが含まれてもパースできる", () => {
    // 実 API: search/query の pages[] 要素は lines: string[] を返す
    const result = SearchResultSchema.parse({
      pages: [
        {
          id: "ページID-001",
          title: "検索結果ページ",
          lines: ["行1のテキスト", "行2のテキスト"],
        },
      ],
      projectName: "テストプロジェクト",
    })
    expect(result.pages[0]?.title).toBe("検索結果ページ")
  })
})
