/**
 * _shared.pat.test.ts — Personal Access Token (PAT) バリデーションの単体テスト。
 *
 * PAT は `pat_` + 64 桁小文字 16 進数から構成される。
 * SID と同じ TokenStore に同居させ、値のプレフィックスで識別する設計のため
 * `assertValidSid` が `pat_` を誤って通過させないことも合わせて検証する。
 */

import { describe, expect, it } from "bun:test"
import {
  PersonalAccessTokenValidationError,
  SidValidationError,
  assertValidPersonalAccessToken,
  assertValidSid,
} from "@/commands/_shared"

// pat_ + 64桁小文字16進数の有効な PAT
const VALID_PAT = `pat_${"a".repeat(64)}`

describe("assertValidPersonalAccessToken / PersonalAccessTokenValidationError", () => {
  it("正常な PAT は検証を通過する", () => {
    expect(() => assertValidPersonalAccessToken(VALID_PAT)).not.toThrow()
  })

  it("実際の形式 (pat_ + 64桁小文字16進数) の PAT は検証を通過する", () => {
    const pat = "pat_edcc66c74a7ab280adcb33be05eaabd1158ec4e6d6b604284ccc83e99d094ac6"
    expect(() => assertValidPersonalAccessToken(pat)).not.toThrow()
  })

  it("空文字列は PersonalAccessTokenValidationError をスローする", () => {
    expect(() => assertValidPersonalAccessToken("")).toThrow(PersonalAccessTokenValidationError)
  })

  it("pat_ プレフィックスがない場合は PersonalAccessTokenValidationError をスローする", () => {
    // 64桁の16進数だけ (プレフィックスなし)
    expect(() => assertValidPersonalAccessToken("a".repeat(64))).toThrow(
      PersonalAccessTokenValidationError,
    )
  })

  it("cs_ プレフィックス (Service Account Key) は PersonalAccessTokenValidationError をスローする", () => {
    const saKey = `cs_${"0".repeat(64)}`
    expect(() => assertValidPersonalAccessToken(saKey)).toThrow(PersonalAccessTokenValidationError)
  })

  it("pat_ の後が 64 桁未満は PersonalAccessTokenValidationError をスローする", () => {
    const shortPat = `pat_${"a".repeat(63)}`
    expect(() => assertValidPersonalAccessToken(shortPat)).toThrow(
      PersonalAccessTokenValidationError,
    )
  })

  it("pat_ の後が 64 桁より長い場合は PersonalAccessTokenValidationError をスローする", () => {
    const longPat = `pat_${"a".repeat(65)}`
    expect(() => assertValidPersonalAccessToken(longPat)).toThrow(
      PersonalAccessTokenValidationError,
    )
  })

  it("大文字 16 進数を含む場合は PersonalAccessTokenValidationError をスローする", () => {
    // PAT は小文字 16 進数のみ有効
    const upperPat = `pat_${"A".repeat(64)}`
    expect(() => assertValidPersonalAccessToken(upperPat)).toThrow(
      PersonalAccessTokenValidationError,
    )
  })

  it("16 進数以外の文字を含む場合は PersonalAccessTokenValidationError をスローする", () => {
    // 'g' は 16 進数文字ではない
    const invalidPat = `pat_${"g".repeat(64)}`
    expect(() => assertValidPersonalAccessToken(invalidPat)).toThrow(
      PersonalAccessTokenValidationError,
    )
  })

  it("PersonalAccessTokenValidationError は Error を継承し分かりやすいメッセージを持つ", () => {
    const err = new PersonalAccessTokenValidationError()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("PersonalAccessTokenValidationError")
    expect(err.message).toContain("pat_")
  })
})

describe("assertValidSid — pat_ プレフィックスの誤通過防止", () => {
  it("pat_ で始まる 68 文字の値は SidValidationError をスローする (PAT を SID に誤投入した場合の明示ガード)", () => {
    // TokenStore に PAT を保存した値を誤って SID 経路に流し込んだ場合、
    // SID_PATTERN だけでは通過してしまうバグへの明示対処
    expect(() => assertValidSid(VALID_PAT)).toThrow(SidValidationError)
  })

  it("pat_xxx (短い) も SidValidationError をスローする", () => {
    expect(() => assertValidSid("pat_abc123")).toThrow(SidValidationError)
  })
})
