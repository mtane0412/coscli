/**
 * _shared.pat.test.ts — Personal Access Token (PAT) バリデーションおよび buildRestClient の単体テスト。
 *
 * PAT は `pat_` + 64 桁小文字 16 進数から構成される。
 * SID と同じ TokenStore に同居させ、値のプレフィックスで識別する設計のため
 * `assertValidSid` が `pat_` を誤って通過させないことも合わせて検証する。
 *
 * requireSid は書き込みコマンド専用のため、PAT を検出した場合は
 * AUTH_WRITE_NOT_SUPPORTED (exit 2) で明示拒否する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import {
  PersonalAccessTokenValidationError,
  SidValidationError,
  assertValidPersonalAccessToken,
  assertValidSid,
  buildRestClient,
  requireSid,
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

describe("buildRestClient — COS_PERSONAL_ACCESS_TOKEN 環境変数", () => {
  let exitMock: ReturnType<typeof spyOn>
  let stdoutMock: ReturnType<typeof spyOn>

  beforeEach(() => {
    exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SID")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
  })

  afterEach(() => {
    exitMock.mockRestore()
    stdoutMock.mockRestore()
    Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
    Reflect.deleteProperty(process.env, "COS_SID")
    Reflect.deleteProperty(process.env, "COS_SERVICE_ACCOUNT_KEY")
  })

  it("COS_PERSONAL_ACCESS_TOKEN が有効な PAT の場合は PAT クライアントを返す", async () => {
    // 環境変数に有効な PAT をセット
    process.env["COS_PERSONAL_ACCESS_TOKEN"] = VALID_PAT
    const client = await buildRestClient({
      json: false,
      plain: false,
      "results-only": false,
      quiet: true,
    })
    // exit が呼ばれずに CosenseRestClient が返ること
    expect(exitMock).not.toHaveBeenCalled()
    expect(client).toBeDefined()
  })

  it("COS_PERSONAL_ACCESS_TOKEN に不正な値が設定されている場合は exit 5 で終了する", async () => {
    // 不正フォーマット (pat_ プレフィックスがない)
    process.env["COS_PERSONAL_ACCESS_TOKEN"] = "invalid-pat-format"
    try {
      await buildRestClient({
        json: false,
        plain: false,
        "results-only": false,
        quiet: true,
      })
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("INVALID_PERSONAL_ACCESS_TOKEN")
  })

  it("COS_PERSONAL_ACCESS_TOKEN が COS_SERVICE_ACCOUNT_KEY より優先される", async () => {
    // 両方設定されている場合、PAT が優先 (env の優先順位: PAT > SA Key > sid)
    process.env["COS_PERSONAL_ACCESS_TOKEN"] = VALID_PAT
    process.env["COS_SERVICE_ACCOUNT_KEY"] = `cs_${"0".repeat(64)}`
    const client = await buildRestClient({
      json: false,
      plain: false,
      "results-only": false,
      quiet: true,
    })
    // exit が呼ばれずに返ること
    expect(exitMock).not.toHaveBeenCalled()
    expect(client).toBeDefined()
  })
})

describe("requireSid — PAT 誤投入の明示拒否", () => {
  let exitMock: ReturnType<typeof spyOn>
  let stdoutMock: ReturnType<typeof spyOn>

  beforeEach(() => {
    exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    Reflect.deleteProperty(process.env, "COS_SID")
  })

  afterEach(() => {
    exitMock.mockRestore()
    stdoutMock.mockRestore()
    Reflect.deleteProperty(process.env, "COS_SID")
  })

  it("COS_SID 環境変数に PAT を設定した場合は exit 2 + AUTH_WRITE_NOT_SUPPORTED で終了する", async () => {
    // COS_SID に誤って PAT を設定した場合 (書き込みコマンドは SID が必要)
    process.env["COS_SID"] = VALID_PAT
    try {
      await requireSid()
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(2)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("AUTH_WRITE_NOT_SUPPORTED")
  })

  it("エラー JSON に hint (sid への切り替え案内) が含まれること", async () => {
    process.env["COS_SID"] = VALID_PAT
    try {
      await requireSid()
    } catch {
      // exitWithError による throw は想定内
    }
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    // ヒントに cos auth login の案内が含まれること
    expect(stdoutOutput).toContain("cos auth login")
  })
})
