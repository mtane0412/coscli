/**
 * page.test.ts — page スキーマの検証テスト。
 *
 * TitleSearchResultSchema が links・image フィールドを含む
 * /api/pages/:project/search/titles レスポンスを正しく解析できることを検証する。
 */

import { describe, expect, it } from "bun:test"
import { TitleSearchResultSchema } from "@/schemas/page"

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
})
