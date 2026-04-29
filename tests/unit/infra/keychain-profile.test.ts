/**
 * keychain-profile.test.ts — validateProfile のユニットテスト。
 *
 * プロファイル名として許容できる文字列と拒否すべき文字列を検証する。
 */

import { describe, expect, it } from "bun:test"
import { validateProfile } from "@/infra/keychain/profile"

describe("validateProfile", () => {
  describe("有効なプロファイル名", () => {
    const validProfiles = [
      "default",
      "個人アカウント",
      "仕事アカウント",
      "my-profile",
      "my_profile",
      "MyProfile123",
      "プロファイル-1",
      "😀emoji",
      "a",
    ]

    for (const profile of validProfiles) {
      it(`"${profile}" は有効なプロファイル名として受け入れる`, () => {
        expect(() => validateProfile(profile)).not.toThrow()
      })
    }
  })

  describe("無効なプロファイル名", () => {
    it("空文字列を拒否する", () => {
      expect(() => validateProfile("")).toThrow("プロファイル名")
    })

    it("制御文字 (\\x00) を含む名前を拒否する", () => {
      expect(() => validateProfile("test\x00name")).toThrow("プロファイル名")
    })

    it("改行 (\\n) を含む名前を拒否する", () => {
      expect(() => validateProfile("test\nname")).toThrow("プロファイル名")
    })

    it("改行 (\\r) を含む名前を拒否する", () => {
      expect(() => validateProfile("test\rname")).toThrow("プロファイル名")
    })

    it("シングルクォートを含む名前を拒否する", () => {
      expect(() => validateProfile("test'name")).toThrow("プロファイル名")
    })

    it("ダブルクォートを含む名前を拒否する", () => {
      expect(() => validateProfile('test"name')).toThrow("プロファイル名")
    })

    it("コロン (:) を含む名前を拒否する (cmdkey 構文破壊回避)", () => {
      expect(() => validateProfile("test:name")).toThrow("プロファイル名")
    })

    it("スラッシュ (/) を含む名前を拒否する (cmdkey フラグ誤認回避)", () => {
      expect(() => validateProfile("test/name")).toThrow("プロファイル名")
    })

    it("先頭がハイフン (-) の名前を拒否する (secret-tool / cmdkey フラグ誤認回避)", () => {
      expect(() => validateProfile("-profile")).toThrow("プロファイル名")
    })

    it("先頭に空白を含む名前を拒否する", () => {
      expect(() => validateProfile(" profile")).toThrow("プロファイル名")
    })

    it("末尾に空白を含む名前を拒否する", () => {
      expect(() => validateProfile("profile ")).toThrow("プロファイル名")
    })
  })
})
