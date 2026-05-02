/**
 * encoder.test.ts — Cosense ページタイトルの URL スラッグ変換テスト。
 */

import { describe, expect, it } from "bun:test"
import { buildIconUrl, buildPageUrl, decodePageTitle, encodePageTitle } from "@/core/api/encoder"

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

describe("buildIconUrl", () => {
  it("プロジェクト名とタイトルからアイコン URL を生成する", () => {
    expect(buildIconUrl("myproject", "Hello World")).toBe(
      "https://scrapbox.io/api/pages/myproject/Hello_World/icon",
    )
  })

  it("日本語タイトルを含むアイコン URL を生成する", () => {
    expect(buildIconUrl("テストプロジェクト", "日本語ページ")).toBe(
      "https://scrapbox.io/api/pages/%E3%83%86%E3%82%B9%E3%83%88%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88/%E6%97%A5%E6%9C%AC%E8%AA%9E%E3%83%9A%E3%83%BC%E3%82%B8/icon",
    )
  })

  it("半角スペースをアンダースコアに変換してアイコン URL を生成する", () => {
    expect(buildIconUrl("my project", "my page")).toBe(
      "https://scrapbox.io/api/pages/my%20project/my_page/icon",
    )
  })

  it("プロジェクト名が空の場合はエラーをスローする", () => {
    expect(() => buildIconUrl("", "ページタイトル")).toThrow("プロジェクト名を指定してください")
  })

  it("タイトルが空の場合はエラーをスローする", () => {
    expect(() => buildIconUrl("myproject", "")).toThrow("タイトルを指定してください")
  })
})
