/**
 * credential.test.ts — Credential ドメイン型と判別関数のテスト。
 *
 * 認証方式 (SID / PAT / SA Key) を統一的に扱う Credential 型の
 * 構築・判別・能力チェックを検証する。
 */

import { describe, expect, it } from "bun:test"
import {
  CredentialParseError,
  canWrite,
  detectCredentialKind,
  displayKind,
  parseCredential,
} from "@/core/auth/credential"

// テスト用フィクスチャ
const VALID_SID = "s%3AabcDEF123456789012345678901234567890"
const VALID_PAT = `pat_${"a".repeat(64)}`
const VALID_SA_KEY = `cs_${"b".repeat(64)}`
const DEFAULT_PROJECT = "my-cosense-project"

describe("detectCredentialKind", () => {
  it("pat_ プレフィックスは PAT と判別できる", () => {
    expect(detectCredentialKind(VALID_PAT)).toBe("pat")
  })

  it("cs_ プレフィックスは SA と判別できる", () => {
    expect(detectCredentialKind(VALID_SA_KEY)).toBe("sa")
  })

  it("s%3A で始まる SID は SID と判別できる", () => {
    // SID はエンコードされた cookie 値なので pat_/cs_ 以外は SID とみなす
    expect(detectCredentialKind(VALID_SID)).toBe("sid")
  })

  it("空文字は unknown と判別できる", () => {
    expect(detectCredentialKind("")).toBe("unknown")
  })

  it("pat_/cs_ 以外のプレフィックスは SID として判別できる", () => {
    // SID のフォーマットは多様 (例: s%3A<random>, 英数字の組み合わせ等) なため
    // pat_/cs_ 以外はすべて SID とみなす
    expect(detectCredentialKind("xyz_unknown")).toBe("sid")
  })
})

describe("parseCredential — SID", () => {
  it("有効な SID から SID Credential を構築できる", () => {
    const cred = parseCredential(VALID_SID)
    expect(cred.kind).toBe("sid")
    expect(cred.value).toBe(VALID_SID)
  })

  it("SID に省略可能な defaultProject を付与できる", () => {
    const cred = parseCredential(VALID_SID, { defaultProject: DEFAULT_PROJECT })
    expect(cred.kind).toBe("sid")
    expect(cred.defaultProject).toBe(DEFAULT_PROJECT)
  })

  it("空文字の SID は CredentialParseError をスローする", () => {
    expect(() => parseCredential("")).toThrow(CredentialParseError)
  })

  it("制御文字を含む SID は CredentialParseError をスローする", () => {
    expect(() => parseCredential("sid\x00value")).toThrow(CredentialParseError)
  })

  it("PAT 文字列を渡すと PAT Credential として自動判別される", () => {
    // detectCredentialKind が pat_ を PAT と判別するため PAT Credential を返す
    const cred = parseCredential(VALID_PAT)
    expect(cred.kind).toBe("pat")
  })
})

describe("parseCredential — PAT", () => {
  it("有効な PAT から PAT Credential を構築できる", () => {
    const cred = parseCredential(VALID_PAT)
    expect(cred.kind).toBe("pat")
    expect(cred.value).toBe(VALID_PAT)
  })

  it("PAT に省略可能な defaultProject を付与できる", () => {
    const cred = parseCredential(VALID_PAT, { defaultProject: DEFAULT_PROJECT })
    expect(cred.defaultProject).toBe(DEFAULT_PROJECT)
  })

  it("pat_ プレフィックスが正しくない PAT は CredentialParseError をスローする", () => {
    // 64桁ではなく63桁
    const shortPat = `pat_${"a".repeat(63)}`
    expect(() => parseCredential(shortPat)).toThrow(CredentialParseError)
  })

  it("大文字を含む PAT は CredentialParseError をスローする", () => {
    const upperPat = `pat_${"A".repeat(64)}`
    expect(() => parseCredential(upperPat)).toThrow(CredentialParseError)
  })
})

describe("parseCredential — SA Key", () => {
  it("有効な SA Key と defaultProject から SA Credential を構築できる", () => {
    const cred = parseCredential(VALID_SA_KEY, { defaultProject: DEFAULT_PROJECT })
    expect(cred.kind).toBe("sa")
    expect(cred.value).toBe(VALID_SA_KEY)
    expect(cred.defaultProject).toBe(DEFAULT_PROJECT)
  })

  it("SA Key に defaultProject を渡さないと CredentialParseError をスローする", () => {
    // SA Credential は defaultProject が必須
    expect(() => parseCredential(VALID_SA_KEY)).toThrow(CredentialParseError)
  })

  it("SA Key に空文字の defaultProject を渡すと CredentialParseError をスローする", () => {
    expect(() => parseCredential(VALID_SA_KEY, { defaultProject: "" })).toThrow(
      CredentialParseError,
    )
  })

  it("cs_ プレフィックスが正しくない SA Key は CredentialParseError をスローする", () => {
    const shortKey = `cs_${"b".repeat(63)}`
    expect(() => parseCredential(shortKey, { defaultProject: DEFAULT_PROJECT })).toThrow(
      CredentialParseError,
    )
  })
})

describe("CredentialParseError", () => {
  it("kind フィールドを持つ", () => {
    try {
      parseCredential("")
    } catch (e) {
      expect(e).toBeInstanceOf(CredentialParseError)
      if (e instanceof CredentialParseError) {
        expect(typeof e.kind).toBe("string")
      }
    }
  })

  it("hint フィールドを持つ", () => {
    try {
      parseCredential("")
    } catch (e) {
      if (e instanceof CredentialParseError) {
        expect(typeof e.hint).toBe("string")
        expect(e.hint.length).toBeGreaterThan(0)
      }
    }
  })
})

describe("canWrite", () => {
  it("SID Credential は書き込み可能", () => {
    const cred = parseCredential(VALID_SID)
    expect(canWrite(cred)).toBe(true)
  })

  it("PAT Credential は書き込み不可", () => {
    const cred = parseCredential(VALID_PAT)
    expect(canWrite(cred)).toBe(false)
  })

  it("SA Credential は書き込み不可", () => {
    const cred = parseCredential(VALID_SA_KEY, { defaultProject: DEFAULT_PROJECT })
    expect(canWrite(cred)).toBe(false)
  })
})

describe("displayKind", () => {
  it("SID Credential の表示文字列は 'SID'", () => {
    const cred = parseCredential(VALID_SID)
    expect(displayKind(cred)).toBe("SID")
  })

  it("PAT Credential の表示文字列は 'PAT'", () => {
    const cred = parseCredential(VALID_PAT)
    expect(displayKind(cred)).toBe("PAT")
  })

  it("SA Credential の表示文字列は 'Service Account'", () => {
    const cred = parseCredential(VALID_SA_KEY, { defaultProject: DEFAULT_PROJECT })
    expect(displayKind(cred)).toBe("Service Account")
  })
})
