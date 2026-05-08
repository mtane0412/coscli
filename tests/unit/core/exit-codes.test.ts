/**
 * exit-codes.test.ts — 終了コード定義の構造テスト。
 *
 * EXIT_CODES 配列と EXIT_* 個別定数の正確性・一意性・順序を検証する。
 */

import { describe, expect, it } from "bun:test"
import {
  EXIT_CODES,
  EXIT_CONFLICT,
  EXIT_ERROR,
  EXIT_FORBIDDEN,
  EXIT_NOT_FOUND,
  EXIT_POLICY_DENIED,
  EXIT_SUCCESS,
  EXIT_TIMEOUT,
  EXIT_UNAUTHORIZED,
  EXIT_VALIDATION_ERROR,
} from "@/core/exit-codes"

describe("EXIT_CODES 配列", () => {
  it("必須の終了コードをすべて含む", () => {
    const codes = EXIT_CODES.map((e) => e.code)
    expect(codes).toEqual(expect.arrayContaining([0, 1, 2, 3, 4, 5, 6, 7, 124]))
  })

  it("code 昇順で並んでいる", () => {
    const codes = EXIT_CODES.map((e) => e.code)
    const sorted = [...codes].sort((a, b) => a - b)
    expect(codes).toEqual(sorted)
  })

  it("code が一意である", () => {
    const codes = EXIT_CODES.map((e) => e.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  it("name が一意である", () => {
    const names = EXIT_CODES.map((e) => e.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it("name が snake_case である", () => {
    const snakeCasePattern = /^[a-z][a-z0-9_]*$/
    for (const entry of EXIT_CODES) {
      expect(entry.name).toMatch(snakeCasePattern)
    }
  })

  it("description が空でない", () => {
    for (const entry of EXIT_CODES) {
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })
})

describe("EXIT_* 個別定数", () => {
  it("EXIT_SUCCESS は 0 である", () => {
    expect(EXIT_SUCCESS).toBe(0)
  })

  it("EXIT_ERROR は 1 である", () => {
    expect(EXIT_ERROR).toBe(1)
  })

  it("EXIT_UNAUTHORIZED は 2 である", () => {
    expect(EXIT_UNAUTHORIZED).toBe(2)
  })

  it("EXIT_FORBIDDEN は 3 である", () => {
    expect(EXIT_FORBIDDEN).toBe(3)
  })

  it("EXIT_NOT_FOUND は 4 である", () => {
    expect(EXIT_NOT_FOUND).toBe(4)
  })

  it("EXIT_VALIDATION_ERROR は 5 である", () => {
    expect(EXIT_VALIDATION_ERROR).toBe(5)
  })

  it("EXIT_CONFLICT は 6 である", () => {
    expect(EXIT_CONFLICT).toBe(6)
  })

  it("EXIT_POLICY_DENIED は 7 である", () => {
    expect(EXIT_POLICY_DENIED).toBe(7)
  })

  it("EXIT_TIMEOUT は 124 である", () => {
    expect(EXIT_TIMEOUT).toBe(124)
  })

  it("各定数が EXIT_CODES 配列の code と一致する", () => {
    const codeMap = new Map(EXIT_CODES.map((e) => [e.code, e.name]))
    expect(codeMap.get(EXIT_SUCCESS)).toBe("success")
    expect(codeMap.get(EXIT_ERROR)).toBe("error")
    expect(codeMap.get(EXIT_UNAUTHORIZED)).toBe("unauthorized")
    expect(codeMap.get(EXIT_FORBIDDEN)).toBe("forbidden")
    expect(codeMap.get(EXIT_NOT_FOUND)).toBe("not_found")
    expect(codeMap.get(EXIT_VALIDATION_ERROR)).toBe("validation_error")
    expect(codeMap.get(EXIT_CONFLICT)).toBe("conflict")
    expect(codeMap.get(EXIT_POLICY_DENIED)).toBe("policy_denied")
    expect(codeMap.get(EXIT_TIMEOUT)).toBe("timeout")
  })
})
