/**
 * encoder.test.ts — Cosense ページタイトルの URL スラッグ変換テスト。
 */

import { describe, expect, it } from "bun:test"
import { buildPageUrl, decodePageTitle, encodePageTitle } from "@/core/api/encoder"

describe("encodePageTitle", () => {
  it("半角スペースをアンダースコアに変換する", () => {
    expect(encodePageTitle("Hello World")).toBe("Hello_World")
  })

  it("複数の連続スペースもそれぞれアンダースコアに変換する", () => {
    expect(encodePageTitle("A  B")).toBe("A__B")
  })

  it("全角スペースはそのままパーセントエンコードする", () => {
    expect(encodePageTitle("Hello　World")).toBe("Hello%E3%80%80World")
  })

  it("日本語タイトルをパーセントエンコードする", () => {
    expect(encodePageTitle("日本語")).toBe("%E6%97%A5%E6%9C%AC%E8%AA%9E")
  })

  it("英数字のみの場合はそのまま返す", () => {
    expect(encodePageTitle("Hello123")).toBe("Hello123")
  })

  it("記号を含むタイトルをエンコードする", () => {
    expect(encodePageTitle("foo/bar")).toBe("foo%2Fbar")
  })

  it("アンダースコアそのものを含むタイトルもエンコードする", () => {
    // アンダースコアは RFC 3986 で unreserved なためエンコードしない
    expect(encodePageTitle("foo_bar")).toBe("foo_bar")
  })

  it("空文字列をそのまま返す", () => {
    expect(encodePageTitle("")).toBe("")
  })

  it("タブ文字をパーセントエンコードする", () => {
    expect(encodePageTitle("foo\tbar")).toBe("foo%09bar")
  })
})

describe("decodePageTitle", () => {
  it("アンダースコアをスペースに戻す", () => {
    expect(decodePageTitle("Hello_World")).toBe("Hello World")
  })

  it("パーセントエンコードをデコードする", () => {
    expect(decodePageTitle("%E6%97%A5%E6%9C%AC%E8%AA%9E")).toBe("日本語")
  })

  it("空文字列をそのまま返す", () => {
    expect(decodePageTitle("")).toBe("")
  })
})

describe("buildPageUrl", () => {
  it("プロジェクト名とタイトルから URL を生成する", () => {
    expect(buildPageUrl("myproject", "Hello World")).toBe(
      "https://scrapbox.io/myproject/Hello_World",
    )
  })

  it("日本語タイトルを含む URL を生成する", () => {
    expect(buildPageUrl("myproject", "日本語")).toBe(
      "https://scrapbox.io/myproject/%E6%97%A5%E6%9C%AC%E8%AA%9E",
    )
  })

  it("プロジェクト名が空の場合はエラーをスローする", () => {
    expect(() => buildPageUrl("", "Hello")).toThrow("プロジェクト名を指定してください")
  })

  it("タイトルが空の場合はエラーをスローする", () => {
    expect(() => buildPageUrl("myproject", "")).toThrow("タイトルを指定してください")
  })
})
