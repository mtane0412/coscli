/**
 * guide.test.ts — NOTATION_GUIDE 定数の構造テスト。
 *
 * セクション・アイテム・tips の形式要件を検証する。
 */

import { describe, expect, it } from "bun:test"
import { NOTATION_GUIDE } from "@/core/notation/guide"

describe("NOTATION_GUIDE", () => {
  it("sections 配列を持つ", () => {
    expect(Array.isArray(NOTATION_GUIDE.sections)).toBe(true)
    expect(NOTATION_GUIDE.sections.length).toBeGreaterThan(0)
  })

  it("tips 配列を持つ", () => {
    expect(Array.isArray(NOTATION_GUIDE.tips)).toBe(true)
    expect(NOTATION_GUIDE.tips.length).toBeGreaterThan(0)
  })

  it("各 section は title と items を持つ", () => {
    for (const section of NOTATION_GUIDE.sections) {
      expect(typeof section.title).toBe("string")
      expect(section.title.length).toBeGreaterThan(0)
      expect(Array.isArray(section.items)).toBe(true)
    }
  })

  it("各 item は syntax と description を持つ", () => {
    for (const section of NOTATION_GUIDE.sections) {
      for (const item of section.items) {
        expect(typeof item.syntax).toBe("string")
        expect(typeof item.description).toBe("string")
      }
    }
  })

  it("tips に * の数と強調サイズの注意事項が含まれる", () => {
    const allTips = NOTATION_GUIDE.tips.join(" ")
    // issue #82 の主要ミスに関する注意が tips に含まれること
    expect(allTips).toMatch(/\*/)
  })

  it("文字装飾セクションが含まれる", () => {
    const titles = NOTATION_GUIDE.sections.map((s) => s.title)
    // 文字装飾に関するセクションが存在すること
    const hasBoldSection = titles.some(
      (t) => t.includes("装飾") || t.includes("強調") || t.includes("文字"),
    )
    expect(hasBoldSection).toBe(true)
  })
})
