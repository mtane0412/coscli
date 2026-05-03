/**
 * index.test.ts — convert ディスパッチャのテスト。
 */

import { describe, expect, test } from "bun:test"
import { convert } from "@/core/format/index"

describe("convert ディスパッチ", () => {
  test("scrapbox → md 変換が動く", () => {
    const input = "ページタイトル\n本文"
    const result = convert(input, "scrapbox", "md")
    expect(result).toContain("# ページタイトル")
    expect(result).toContain("本文")
  })

  test("md → scrapbox 変換が動く", () => {
    const input = "## 見出し\n本文"
    const result = convert(input, "md", "scrapbox")
    expect(result).toContain("[*** 見出し]")
    expect(result).toContain("本文")
  })

  test("from === to は SAME_FORMAT_ERROR を throw する", () => {
    expect(() => convert("テキスト", "md", "md")).toThrow("SAME_FORMAT_ERROR")
    expect(() => convert("テキスト", "scrapbox", "scrapbox")).toThrow("SAME_FORMAT_ERROR")
  })

  test("boldStyle オプションが scrapbox → md に伝わる", () => {
    const input = "タイトル\n[* 見出し]"
    const resultEmphasis = convert(input, "scrapbox", "md", { boldStyle: "emphasis" })
    expect(resultEmphasis).toContain("**見出し**")
  })
})
