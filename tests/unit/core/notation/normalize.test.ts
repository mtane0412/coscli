/**
 * normalize.test.ts — normalizeCodeBlockEmptyLines() の単体テスト。
 *
 * Scrapbox コードブロック内の空行が " " (スペース) に変換されることを検証する。
 * コードブロック外の空行は変換されないことも確認する。
 */

import { describe, expect, test } from "bun:test"
import { normalizeCodeBlockEmptyLines } from "@/core/notation/normalize"

describe("normalizeCodeBlockEmptyLines", () => {
  describe("変換なしケース", () => {
    test("空配列は空配列を返す", () => {
      expect(normalizeCodeBlockEmptyLines([])).toEqual([])
    })

    test("コードブロックが存在しない場合、元の配列と同等の配列を返す", () => {
      const input = ["通常テキスト", "", "次の段落"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(["通常テキスト", "", "次の段落"])
    })

    test("空のコードブロック (本文なし) はそのまま返す", () => {
      const input = ["code:python", "通常テキスト"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(["code:python", "通常テキスト"])
    })

    test("コードブロックに空行がない場合はそのまま返す", () => {
      const input = ["code:python", " def hello():", "     print('hello')", "通常テキスト"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual([
        "code:python",
        " def hello():",
        "     print('hello')",
        "通常テキスト",
      ])
    })
  })

  describe("コードブロック内の空行変換", () => {
    test("コードブロック内の空行を ' ' (スペース) に変換する", () => {
      const input = ["code:python", " def hello():", "", "     print('hello')"]
      const expected = ["code:python", " def hello():", " ", "     print('hello')"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })

    test("コードブロック内の連続した空行をすべて ' ' に変換する", () => {
      const input = ["code:python", " line1", "", "", " line2"]
      const expected = ["code:python", " line1", " ", " ", " line2"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })

    test("タブインデントのコードブロック内の空行も ' ' に変換する", () => {
      const input = ["code:python", "\tdef hello():", "", "\t\tprint('hello')"]
      const expected = ["code:python", "\tdef hello():", " ", "\t\tprint('hello')"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })
  })

  describe("コードブロック終了の判定", () => {
    test("コードブロック末尾の空行はブロック終了とみなし '' のまま返す", () => {
      // 次の非空行がインデントされていないため、空行はブロック外と判定する
      const input = ["code:python", " x = 1", "", "通常テキスト"]
      const expected = ["code:python", " x = 1", "", "通常テキスト"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })

    test("コードブロック後の空行はそのまま '' を保つ", () => {
      const input = ["code:python", " x = 1", "通常テキスト", "", "次の段落"]
      const expected = ["code:python", " x = 1", "通常テキスト", "", "次の段落"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })

    test("インデントのない非空行でコードブロックが終了する", () => {
      const input = ["code:python", " x = 1", "ブロック外テキスト"]
      const expected = ["code:python", " x = 1", "ブロック外テキスト"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })

    test("ファイル末尾にコードブロック内の空行があってもブロック終了と判定する", () => {
      // 次の非空行が存在しないため、ブロック終了と判定する
      const input = ["code:python", " x = 1", ""]
      const expected = ["code:python", " x = 1", ""]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })
  })

  describe("複数コードブロック", () => {
    test("複数のコードブロックがある場合、それぞれ独立して変換する", () => {
      const input = [
        "コードブロック1:",
        "code:python",
        " x = 1",
        "", // ← ブロック内の空行 → " " に変換
        " y = 2",
        "", // ← ブロック終了後の空行 → そのまま
        "コードブロック2:",
        "code:javascript",
        " const a = 1",
        "", // ← ブロック内の空行 → " " に変換
        " const b = 2",
      ]
      const expected = [
        "コードブロック1:",
        "code:python",
        " x = 1",
        " ", // ← 変換される
        " y = 2",
        "", // ← そのまま
        "コードブロック2:",
        "code:javascript",
        " const a = 1",
        " ", // ← 変換される
        " const b = 2",
      ]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })
  })

  describe("実用的なケース", () => {
    test("コードブロック内に空行を含む Python 関数が正しく変換される", () => {
      const input = [
        "Pythonのサンプルコード:",
        "code:python",
        " def hello():",
        "     pass",
        "",
        " def world():",
        "     pass",
        "",
        "コードの説明テキスト",
      ]
      const expected = [
        "Pythonのサンプルコード:",
        "code:python",
        " def hello():",
        "     pass",
        " ", // ← " " に変換
        " def world():",
        "     pass",
        "", // ← ブロック終了後の空行はそのまま
        "コードの説明テキスト",
      ]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(expected)
    })

    test("コードブロック外の空行を含む通常テキストはそのまま保つ", () => {
      const input = ["段落1", "", "段落2", "", "段落3"]
      expect(normalizeCodeBlockEmptyLines(input)).toEqual(input)
    })
  })
})
