/**
 * range.test.ts — 行指定パース (parseLineSpec) のテスト。
 *
 * --line と --range の引数を 1-indexed の {start, end} に変換する関数の検証。
 */

import { describe, expect, it } from "bun:test"
import { RangeSpecError, parseLineSpec } from "@/core/range"

describe("parseLineSpec", () => {
  describe("--line 単独指定", () => {
    it("数値を start=end に変換する", () => {
      // 5行目を指定した場合 → {start:5, end:5}
      expect(parseLineSpec({ line: "5" })).toEqual({ start: 5, end: 5 })
    })

    it("1 を指定した場合 start=end=1 になる", () => {
      // タイトル行番号 (1) を指定可能 (呼び出し側でタイトル保護を行う)
      expect(parseLineSpec({ line: "1" })).toEqual({ start: 1, end: 1 })
    })

    it("大きな数値も正しく変換する", () => {
      expect(parseLineSpec({ line: "999" })).toEqual({ start: 999, end: 999 })
    })
  })

  describe("--range 単独指定", () => {
    it("a:b 形式を {start:a, end:b} に変換する", () => {
      // 3行目から7行目まで
      expect(parseLineSpec({ range: "3:7" })).toEqual({ start: 3, end: 7 })
    })

    it("start = end の場合も正しく変換する", () => {
      expect(parseLineSpec({ range: "5:5" })).toEqual({ start: 5, end: 5 })
    })

    it("1:2 も正しく変換する", () => {
      expect(parseLineSpec({ range: "1:2" })).toEqual({ start: 1, end: 2 })
    })
  })

  describe("エラー: 両方未指定", () => {
    it("line も range も未指定なら RangeSpecError", () => {
      expect(() => parseLineSpec({})).toThrow(RangeSpecError)
    })

    it("空文字でも RangeSpecError", () => {
      // exactOptionalPropertyTypes により undefined は渡せないため空文字で代替テスト
      expect(() => parseLineSpec({ line: "", range: "" })).toThrow(RangeSpecError)
    })

    it("エラーメッセージが日本語を含む", () => {
      expect(() => parseLineSpec({})).toThrow(/--line/)
    })
  })

  describe("エラー: 両方同時指定", () => {
    it("line と range を同時指定すると RangeSpecError", () => {
      expect(() => parseLineSpec({ line: "5", range: "3:7" })).toThrow(RangeSpecError)
    })

    it("エラーメッセージが日本語を含む", () => {
      expect(() => parseLineSpec({ line: "5", range: "3:7" })).toThrow(/同時に/)
    })
  })

  describe("エラー: 不正な --line 値", () => {
    it("0 は不正 (1-indexed)", () => {
      expect(() => parseLineSpec({ line: "0" })).toThrow(RangeSpecError)
    })

    it("負数は不正", () => {
      expect(() => parseLineSpec({ line: "-1" })).toThrow(RangeSpecError)
    })

    it("アルファベットは不正", () => {
      expect(() => parseLineSpec({ line: "abc" })).toThrow(RangeSpecError)
    })

    it("空文字は不正", () => {
      expect(() => parseLineSpec({ line: "" })).toThrow(RangeSpecError)
    })

    it("小数は不正", () => {
      expect(() => parseLineSpec({ line: "3.5" })).toThrow(RangeSpecError)
    })
  })

  describe("エラー: 不正な --range 値", () => {
    it("0:5 は不正 (a<1)", () => {
      expect(() => parseLineSpec({ range: "0:5" })).toThrow(RangeSpecError)
    })

    it("7:3 は不正 (a>b)", () => {
      expect(() => parseLineSpec({ range: "7:3" })).toThrow(RangeSpecError)
    })

    it("空文字は不正", () => {
      expect(() => parseLineSpec({ range: "" })).toThrow(RangeSpecError)
    })

    it("コロンがない (abc) は不正", () => {
      expect(() => parseLineSpec({ range: "abc" })).toThrow(RangeSpecError)
    })

    it("コロン後が空 (1:) は不正", () => {
      expect(() => parseLineSpec({ range: "1:" })).toThrow(RangeSpecError)
    })

    it("コロン前が空 (:5) は不正", () => {
      expect(() => parseLineSpec({ range: ":5" })).toThrow(RangeSpecError)
    })

    it("3 要素 (3:7:9) は不正", () => {
      expect(() => parseLineSpec({ range: "3:7:9" })).toThrow(RangeSpecError)
    })

    it("アルファベット混入 (a:5) は不正", () => {
      expect(() => parseLineSpec({ range: "a:5" })).toThrow(RangeSpecError)
    })

    it("エラーメッセージが日本語を含む", () => {
      expect(() => parseLineSpec({ range: "7:3" })).toThrow(/a≤b/)
    })
  })
})
