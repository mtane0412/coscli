/**
 * wrap-untrusted.test.ts — wrapUntrustedText のテスト。
 *
 * --wrap-untrusted フラグが有効のとき、AI エージェントへの出力テキストを
 * <external_content> タグで囲んでプロンプトインジェクションを防ぐ機能を検証する。
 */

import { describe, expect, it } from "bun:test"
import { buildCosenseSource, wrapUntrustedText } from "@/presenter/wrap-untrusted"

describe("wrapUntrustedText", () => {
  it("テキストを <external_content> タグで囲む", () => {
    const result = wrapUntrustedText("こんにちは世界")
    expect(result).toContain("<external_content>")
    expect(result).toContain("こんにちは世界")
    expect(result).toContain("</external_content>")
  })

  it("source 属性を指定すると source 付きタグになる", () => {
    const result = wrapUntrustedText("テスト本文", "cosense:myproject/テストページ")
    expect(result).toContain('source="cosense:myproject/テストページ"')
    expect(result).toContain("テスト本文")
  })

  it("source 省略時は source 属性なしのタグになる", () => {
    const result = wrapUntrustedText("テスト本文")
    expect(result).not.toContain("source=")
    expect(result).toContain("<external_content>")
  })

  it("複数行テキストもそのまま囲む", () => {
    const multiline = "1行目\n2行目\n3行目"
    const result = wrapUntrustedText(multiline, "cosense:p/t")
    expect(result).toContain("1行目")
    expect(result).toContain("2行目")
    expect(result).toContain("3行目")
    expect(result.indexOf("<external_content")).toBeLessThan(result.indexOf("1行目"))
    expect(result.indexOf("</external_content>")).toBeGreaterThan(result.indexOf("3行目"))
  })

  it("空文字もタグで囲む", () => {
    const result = wrapUntrustedText("")
    expect(result).toContain("<external_content>")
    expect(result).toContain("</external_content>")
  })
})

describe("buildCosenseSource", () => {
  it("cosense:<project>/<title> 形式の文字列を返す", () => {
    expect(buildCosenseSource("myproject", "テストページ")).toBe("cosense:myproject/テストページ")
  })

  it("スラッシュを含むタイトルもそのまま連結する", () => {
    expect(buildCosenseSource("proj", "A/B")).toBe("cosense:proj/A/B")
  })
})
