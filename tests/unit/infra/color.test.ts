/**
 * src/infra/color.ts のユニットテスト。
 *
 * initColor(mode) で色付けを初期化し、isColorEnabled() で状態を確認できること、
 * color.* ラッパーが never モードで ANSI なし・always モードで ANSI ありを返すことを検証する。
 */

import { describe, expect, test } from "bun:test"
import { color, initColor, isColorEnabled } from "@/infra/color"

describe("color.ts", () => {
  describe("initColor", () => {
    test("never モードで isColorEnabled が false を返す", () => {
      initColor("never")
      expect(isColorEnabled()).toBe(false)
    })

    test("always モードで isColorEnabled が true を返す", () => {
      initColor("always")
      expect(isColorEnabled()).toBe(true)
    })
  })

  describe("color wrapper", () => {
    test("never モードで color.red が ANSI なしを返す", () => {
      initColor("never")
      expect(color.red("テスト文字列")).toBe("テスト文字列")
    })

    test("always モードで color.red が ANSI コードを含む", () => {
      initColor("always")
      const 結果 = color.red("テスト文字列")
      expect(結果).toContain("テスト文字列")
      // ANSI コード付きのため元の文字列とは異なるはず
      expect(結果).not.toBe("テスト文字列")
    })

    test("never モードで color.gray が ANSI なしを返す", () => {
      initColor("never")
      expect(color.gray("グレー文字")).toBe("グレー文字")
    })

    test("always モードで color.gray が ANSI コードを含む", () => {
      initColor("always")
      const 結果 = color.gray("グレー文字")
      expect(結果).toContain("グレー文字")
      expect(結果).not.toBe("グレー文字")
    })
  })
})
