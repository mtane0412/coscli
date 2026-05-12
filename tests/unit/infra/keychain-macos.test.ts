/**
 * keychain-macos.test.ts — MacOSKeychainStore のユニットテスト。
 *
 * Spawner を差し替えて security コマンドの呼び出し引数と結果のパースを検証する。
 * 実際の macOS Keychain にはアクセスしない。
 */

import { describe, expect, it } from "bun:test"
import { MacOSKeychainStore } from "@/infra/keychain/macos"
import { captureSpawner } from "./_keychain-test-helpers"

describe("MacOSKeychainStore", () => {
  describe("save", () => {
    it("security -i を argv に sid を含めずに呼び出す", async () => {
      const { spawner, calls, getCall } = captureSpawner("", "", 0)
      const store = new MacOSKeychainStore(spawner)
      await store.save("個人アカウント", "sid-test-12345")

      expect(calls).toHaveLength(1)
      // argv は ["security", "-i"] のみで sid が ps に露出しない
      expect(getCall(0).cmd).toEqual(["security", "-i"])
      expect(getCall(0).cmd).not.toContain("sid-test-12345")
    })

    it("save で add-generic-password コマンドが stdin 経由で渡される", async () => {
      const { spawner, getCall } = captureSpawner("", "", 0)
      const store = new MacOSKeychainStore(spawner)
      await store.save("個人アカウント", "sid-test-12345")

      // stdin に add-generic-password コマンドが含まれることを確認する
      const stdin = getCall(0).options?.stdin
      expect(stdin).toBeInstanceOf(Uint8Array)
      const decoded = new TextDecoder().decode(stdin as Uint8Array)
      expect(decoded).toContain("add-generic-password")
      expect(decoded).toContain("coscli")
      expect(decoded).toContain("個人アカウント")
      expect(decoded).toContain("sid-test-12345")
    })

    it("exit code 非 0 のときエラーを throw する", async () => {
      const { spawner } = captureSpawner("", "Keychain エラー", 1)
      const store = new MacOSKeychainStore(spawner)
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow(
        "Keychain への保存に失敗しました",
      )
    })
  })

  describe("load", () => {
    it("security find-generic-password -w を呼び出して SID を返す", async () => {
      const { spawner, getCall } = captureSpawner("sid-abc-123\n", "", 0)
      const store = new MacOSKeychainStore(spawner)
      const result = await store.load("個人アカウント")

      expect(getCall(0).cmd).toEqual([
        "security",
        "find-generic-password",
        "-s",
        "coscli",
        "-a",
        "個人アカウント",
        "-w",
      ])
      expect(result).toBe("sid-abc-123")
    })

    it("exit code 非 0 のとき null を返す", async () => {
      const { spawner } = captureSpawner("", "見つかりません", 1)
      const store = new MacOSKeychainStore(spawner)
      expect(await store.load("存在しないプロファイル")).toBeNull()
    })

    it("stdout が空文字列のとき null を返す", async () => {
      const { spawner } = captureSpawner("   \n", "", 0)
      const store = new MacOSKeychainStore(spawner)
      expect(await store.load("テストプロファイル")).toBeNull()
    })
  })

  describe("delete", () => {
    it("security delete-generic-password を呼び出す", async () => {
      const { spawner, getCall } = captureSpawner("", "", 0)
      const store = new MacOSKeychainStore(spawner)
      await store.delete("個人アカウント")

      expect(getCall(0).cmd).toEqual([
        "security",
        "delete-generic-password",
        "-s",
        "coscli",
        "-a",
        "個人アカウント",
      ])
    })

    it("exit code 非 0 でも例外を throw しない (存在しない場合も成功扱い)", async () => {
      const { spawner } = captureSpawner("", "", 1)
      const store = new MacOSKeychainStore(spawner)
      await expect(store.delete("存在しないプロファイル")).resolves.toBeUndefined()
    })
  })

  describe("list", () => {
    it("security dump-keychain の出力をパースして coscli のプロファイル一覧を返す", async () => {
      // 実際の dump-keychain フォーマット: "acct" は "svce" より前に出力され、keychain: 行でエントリが区切られる
      const dumpOutput = [
        'keychain: "/Users/ユーザー/Library/Keychains/login.keychain"',
        "version: 512",
        'class: "genp"',
        "attributes:",
        '    "acct"<blob>="個人アカウント"',
        '    "svce"<blob>="coscli"',
        '    "type"<uint32>=<NULL>',
        'keychain: "/Users/ユーザー/Library/Keychains/login.keychain"',
        "version: 512",
        'class: "genp"',
        "attributes:",
        '    "acct"<blob>="仕事アカウント"',
        '    "svce"<blob>="coscli"',
        '    "type"<uint32>=<NULL>',
        'keychain: "/Users/ユーザー/Library/Keychains/login.keychain"',
        "version: 512",
        'class: "genp"',
        "attributes:",
        '    "acct"<blob>="他のアプリ"',
        '    "svce"<blob>="other-app"',
        '    "type"<uint32>=<NULL>',
      ].join("\n")

      const { spawner } = captureSpawner(dumpOutput, "", 0)
      const store = new MacOSKeychainStore(spawner)
      const profiles = await store.list()

      expect(profiles).toContain("個人アカウント")
      expect(profiles).toContain("仕事アカウント")
      expect(profiles).not.toContain("他のアプリ")
    })

    it("非 ASCII プロファイル名が 0x 形式でエンコードされていても正しくデコードする", async () => {
      // "山田太郎" の UTF-8 バイト列の 16 進数表現
      const YAMADA_TARO_HEX = "E5B1B1E794B0E5A4AAE9838E"
      const dumpOutput = [
        'keychain: "/Users/ユーザー/Library/Keychains/login.keychain"',
        "version: 512",
        'class: "genp"',
        "attributes:",
        `    "acct"<blob>=0x${YAMADA_TARO_HEX}`,
        '    "svce"<blob>="coscli"',
        '    "type"<uint32>=<NULL>',
      ].join("\n")

      const { spawner } = captureSpawner(dumpOutput, "", 0)
      const store = new MacOSKeychainStore(spawner)
      const profiles = await store.list()

      // 検証: hex デコードされたプロファイル名が返る
      expect(profiles).toContain("山田太郎")
    })

    it("exit code 非 0 のとき空配列を返す", async () => {
      const { spawner } = captureSpawner("", "エラー", 1)
      const store = new MacOSKeychainStore(spawner)
      expect(await store.list()).toEqual([])
    })
  })
})
