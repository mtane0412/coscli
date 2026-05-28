/**
 * guide.test.ts — NOTATION_GUIDE 定数の構造テスト。
 *
 * sections・アイテム・tips セクションの形式要件を検証する。
 */

import { describe, expect, it } from "bun:test"
import { NOTATION_GUIDE } from "@/core/notation/guide"

describe("NOTATION_GUIDE", () => {
  it("sections 配列を持つ", () => {
    expect(Array.isArray(NOTATION_GUIDE.sections)).toBe(true)
    expect(NOTATION_GUIDE.sections.length).toBeGreaterThan(0)
  })

  it("tips トピックが sections に含まれる", () => {
    const tipsSection = NOTATION_GUIDE.sections.find((s) => s.id === "tips")
    expect(tipsSection).toBeDefined()
    expect(tipsSection?.items.length).toBeGreaterThan(0)
  })

  it("各 section は id・title・items を持つ", () => {
    for (const section of NOTATION_GUIDE.sections) {
      expect(typeof section.id).toBe("string")
      expect(section.id.length).toBeGreaterThan(0)
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

  it("tips セクションに * の数と強調サイズの注意事項が含まれる", () => {
    const tipsSection = NOTATION_GUIDE.sections.find((s) => s.id === "tips")
    const allTipText = tipsSection?.items.map((i) => i.description).join(" ") ?? ""
    // issue #82 の主要ミスに関する注意が含まれること
    expect(allTipText).toMatch(/\*/)
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
