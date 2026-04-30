/**
 * keychain-linux.test.ts — LinuxKeychainStore のユニットテスト。
 *
 * Spawner を差し替えて secret-tool コマンドの呼び出し引数とパース処理を検証する。
 * 実際の secret-tool / libsecret にはアクセスしない。
 */

import { describe, expect, it } from "bun:test"
import { LinuxKeychainStore } from "@/infra/keychain/linux"
import { captureSpawner, enoentSpawner } from "./_keychain-test-helpers"

describe("LinuxKeychainStore", () => {
  describe("save", () => {
    it("secret-tool store を正しい引数で呼び出す", async () => {
      const { spawner, calls, getCall } = captureSpawner("", "", 0)
      const store = new LinuxKeychainStore(spawner)
      await store.save("個人アカウント", "sid-test-12345")

      expect(calls).toHaveLength(1)
      expect(getCall(0).cmd).toEqual([
        "secret-tool",
        "store",
        "--label=coscli",
        "service",
        "coscli",
        "account",
        "個人アカウント",
      ])
    })

    it("stdin に SID のバイト列を書き込む", async () => {
      const { spawner, getCall } = captureSpawner("", "", 0)
      const store = new LinuxKeychainStore(spawner)
      await store.save("テストプロファイル", "sid-abc-123")

      // stdin に SID が渡されていることを確認する
      const stdin = getCall(0).options?.stdin
      expect(stdin).toBeDefined()
      // Uint8Array に変換して文字列として検証する
      const text = new TextDecoder().decode(stdin as Uint8Array)
      expect(text).toBe("sid-abc-123")
    })

    it("exit code 非 0 のときエラーを throw する", async () => {
      const { spawner } = captureSpawner("", "secret-tool エラー", 1)
      const store = new LinuxKeychainStore(spawner)
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow(
        "secret-tool への保存に失敗しました",
      )
    })
  })

  describe("load", () => {
    it("secret-tool lookup を呼び出して SID を返す", async () => {
      const { spawner, getCall } = captureSpawner("sid-abc-123\n", "", 0)
      const store = new LinuxKeychainStore(spawner)
      const result = await store.load("個人アカウント")

      expect(getCall(0).cmd).toEqual([
        "secret-tool",
        "lookup",
        "service",
        "coscli",
        "account",
        "個人アカウント",
      ])
      expect(result).toBe("sid-abc-123")
    })

    it("exit code 非 0 のとき null を返す", async () => {
      const { spawner } = captureSpawner("", "見つかりません", 1)
      const store = new LinuxKeychainStore(spawner)
      expect(await store.load("存在しないプロファイル")).toBeNull()
    })

    it("stdout が空文字列のとき null を返す", async () => {
      const { spawner } = captureSpawner("   \n", "", 0)
      const store = new LinuxKeychainStore(spawner)
      expect(await store.load("テストプロファイル")).toBeNull()
    })
  })

  describe("delete", () => {
    it("secret-tool clear を呼び出す", async () => {
      const { spawner, getCall } = captureSpawner("", "", 0)
      const store = new LinuxKeychainStore(spawner)
      await store.delete("個人アカウント")

      expect(getCall(0).cmd).toEqual([
        "secret-tool",
        "clear",
        "service",
        "coscli",
        "account",
        "個人アカウント",
      ])
    })

    it("exit code 非 0 でも例外を throw しない (存在しない場合も成功扱い)", async () => {
      const { spawner } = captureSpawner("", "", 1)
      const store = new LinuxKeychainStore(spawner)
      await expect(store.delete("存在しないプロファイル")).resolves.toBeUndefined()
    })
  })

  describe("list", () => {
    it("libsecret 0.21+ (Ubuntu 24.04): attribute.* が stderr に出力されるフォーマットをパースする", async () => {
      // libsecret 0.21+ では attribute.* 行は stderr、その他は stdout に出力される
      const stdoutOutput = [
        "[/1]",
        "label = coscli",
        "secret = ",
        "",
        "created = 2024-01-01 00:00:00",
        "modified = 2024-01-01 00:00:00",
        "",
        "[/2]",
        "label = coscli",
        "secret = ",
        "",
        "created = 2024-01-01 00:00:00",
        "modified = 2024-01-01 00:00:00",
      ].join("\n")
      const stderrOutput = [
        "attribute.service = coscli",
        "attribute.account = 個人アカウント",
        "attribute.service = coscli",
        "attribute.account = 仕事アカウント",
      ].join("\n")

      const { spawner } = captureSpawner(stdoutOutput, stderrOutput, 0)
      const store = new LinuxKeychainStore(spawner)
      const profiles = await store.list()

      expect(profiles).toContain("個人アカウント")
      expect(profiles).toContain("仕事アカウント")
    })

    it("libsecret 0.20 以前: attribute.* が stdout に出力されるフォーマットもパースする", async () => {
      // libsecret 0.20 以前 (Ubuntu 22.04 等) では attribute.* 行は stdout に出力される
      const searchOutput = [
        "[/org/freedesktop/secrets/collection/login/1]",
        "label = coscli",
        "secret = ",
        "created = 2024-01-01 00:00:00",
        "modified = 2024-01-01 00:00:00",
        "schema = org.freedesktop.Secret.Generic",
        "attribute.service = coscli",
        "attribute.account = 個人アカウント",
        "",
        "[/org/freedesktop/secrets/collection/login/2]",
        "label = coscli",
        "attribute.service = coscli",
        "attribute.account = 仕事アカウント",
      ].join("\n")

      const { spawner } = captureSpawner(searchOutput, "", 0)
      const store = new LinuxKeychainStore(spawner)
      const profiles = await store.list()

      expect(profiles).toContain("個人アカウント")
      expect(profiles).toContain("仕事アカウント")
    })

    it("exit code 非 0 のとき空配列を返す", async () => {
      const { spawner } = captureSpawner("", "エラー", 1)
      const store = new LinuxKeychainStore(spawner)
      expect(await store.list()).toEqual([])
    })

    it("一致が 0 件のとき空配列を返す", async () => {
      const { spawner } = captureSpawner("", "", 0)
      const store = new LinuxKeychainStore(spawner)
      expect(await store.list()).toEqual([])
    })
  })

  describe("未インストール検知 (ENOENT)", () => {
    it("save で secret-tool が見つからないとき専用エラーを throw する", async () => {
      const store = new LinuxKeychainStore(enoentSpawner())
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow("secret-tool")
    })

    it("load で secret-tool が見つからないとき専用エラーを throw する", async () => {
      const store = new LinuxKeychainStore(enoentSpawner())
      await expect(store.load("テストプロファイル")).rejects.toThrow("secret-tool")
    })

    it("delete で secret-tool が見つからないとき専用エラーを throw する", async () => {
      const store = new LinuxKeychainStore(enoentSpawner())
      await expect(store.delete("テストプロファイル")).rejects.toThrow("secret-tool")
    })

    it("list で secret-tool が見つからないとき専用エラーを throw する", async () => {
      const store = new LinuxKeychainStore(enoentSpawner())
      await expect(store.list()).rejects.toThrow("secret-tool")
    })

    it("エラーメッセージに libsecret-tools と --insecure-file-store の案内が含まれる", async () => {
      const store = new LinuxKeychainStore(enoentSpawner())
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow(
        "--insecure-file-store",
      )
    })
  })
})
