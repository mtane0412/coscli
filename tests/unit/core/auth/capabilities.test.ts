/**
 * capabilities.test.ts — 認証種別ごとの能力定義のテスト。
 *
 * AUTH_CAPABILITIES が認証の「単一の事実ソース」として
 * 正しい能力マッピングを定義しているかを検証する。
 */

import { describe, expect, it } from "bun:test"
import { AUTH_CAPABILITIES, canWriteV2OpsAPI, canWriteWebSocket } from "@/core/auth/capabilities"

describe("AUTH_CAPABILITIES", () => {
  it("すべての認証種別が定義されている", () => {
    expect(AUTH_CAPABILITIES.pat).toBeDefined()
    expect(AUTH_CAPABILITIES.sid).toBeDefined()
    expect(AUTH_CAPABILITIES.sa).toBeDefined()
    expect(AUTH_CAPABILITIES.any).toBeDefined()
    expect(AUTH_CAPABILITIES.none).toBeDefined()
  })

  describe("PAT (Personal Access Token)", () => {
    it("読み取りができる", () => {
      expect(AUTH_CAPABILITIES.pat.canRead).toBe(true)
    })

    it("v2 AI ops API への書き込みができる", () => {
      // v2 AI ops (preview/submit 2ステップ) は PAT 専用
      expect(AUTH_CAPABILITIES.pat.canWriteV2OpsAPI).toBe(true)
    })

    it("旧 WebSocket commit への書き込みができない", () => {
      // page.delete/rename/pin/unpin は SID が必要
      expect(AUTH_CAPABILITIES.pat.canWriteWebSocket).toBe(false)
    })

    it("ローカル設定の変更はできない", () => {
      expect(AUTH_CAPABILITIES.pat.canWriteLocalConfig).toBe(false)
    })
  })

  describe("SID (connect.sid セッション Cookie)", () => {
    it("読み取りができる", () => {
      expect(AUTH_CAPABILITIES.sid.canRead).toBe(true)
    })

    it("旧 WebSocket commit への書き込みができる", () => {
      // page.delete/rename/pin/unpin/sync.push は SID 必須
      expect(AUTH_CAPABILITIES.sid.canWriteWebSocket).toBe(true)
    })

    it("v2 AI ops API への書き込みができない", () => {
      // requirePat() で exit 2 になる
      expect(AUTH_CAPABILITIES.sid.canWriteV2OpsAPI).toBe(false)
    })
  })

  describe("SA (サービスアカウントキー)", () => {
    it("読み取りができる", () => {
      expect(AUTH_CAPABILITIES.sa.canRead).toBe(true)
    })

    it("v2 AI ops API への書き込みができない", () => {
      expect(AUTH_CAPABILITIES.sa.canWriteV2OpsAPI).toBe(false)
    })

    it("旧 WebSocket commit への書き込みができない", () => {
      expect(AUTH_CAPABILITIES.sa.canWriteWebSocket).toBe(false)
    })
  })

  describe("any (PAT/SID/SA いずれか)", () => {
    it("読み取りができる", () => {
      expect(AUTH_CAPABILITIES.any.canRead).toBe(true)
    })
  })

  describe("none (認証不要)", () => {
    it("読み取りはできない (Cosense API 呼び出しなし)", () => {
      expect(AUTH_CAPABILITIES.none.canRead).toBe(false)
    })

    it("ローカル設定の変更ができる", () => {
      expect(AUTH_CAPABILITIES.none.canWriteLocalConfig).toBe(true)
    })
  })
})

describe("canWriteV2OpsAPI", () => {
  it("PAT は v2 ops API に書き込みできる", () => {
    expect(canWriteV2OpsAPI("pat")).toBe(true)
  })

  it("SID は v2 ops API に書き込みできない", () => {
    expect(canWriteV2OpsAPI("sid")).toBe(false)
  })

  it("SA は v2 ops API に書き込みできない", () => {
    expect(canWriteV2OpsAPI("sa")).toBe(false)
  })

  it("any は v2 ops API に書き込みできない", () => {
    expect(canWriteV2OpsAPI("any")).toBe(false)
  })

  it("none は v2 ops API に書き込みできない", () => {
    expect(canWriteV2OpsAPI("none")).toBe(false)
  })
})

describe("canWriteWebSocket", () => {
  it("SID は WebSocket commit に書き込みできる", () => {
    expect(canWriteWebSocket("sid")).toBe(true)
  })

  it("PAT は WebSocket commit に書き込みできない", () => {
    expect(canWriteWebSocket("pat")).toBe(false)
  })

  it("SA は WebSocket commit に書き込みできない", () => {
    expect(canWriteWebSocket("sa")).toBe(false)
  })
})
