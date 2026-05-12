/**
 * keychain-windows.test.ts — WindowsKeychainStore のユニットテスト。
 *
 * Spawner を差し替えて cmdkey / PowerShell の呼び出し引数とパース処理を検証する。
 * 実際の cmdkey / CredentialManager にはアクセスしない。
 */

import { describe, expect, it } from "bun:test"
import { WindowsKeychainStore } from "@/infra/keychain/windows"
import { captureSpawner, enoentSpawner } from "./_keychain-test-helpers"

describe("WindowsKeychainStore", () => {
  describe("save", () => {
    it("powershell New-StoredCredential を使って保存する (sid は argv に含めない)", async () => {
      const { spawner, calls, getCall } = captureSpawner("", "", 0)
      const store = new WindowsKeychainStore(spawner)
      await store.save("個人アカウント", "sid-test-12345")

      expect(calls).toHaveLength(1)
      // powershell を使う (cmdkey の /pass: argv に sid を乗せない)
      expect(getCall(0).cmd[0]).toBe("powershell")
      // sid が argv のどこにも含まれない
      expect(getCall(0).cmd.join(" ")).not.toContain("sid-test-12345")
    })

    it("save で sid が COS_SID 環境変数経由で渡される", async () => {
      const { spawner, getCall } = captureSpawner("", "", 0)
      const store = new WindowsKeychainStore(spawner)
      await store.save("個人アカウント", "sid-test-12345")

      // COS_SID 環境変数に sid が設定されることを確認する
      const env = getCall(0).options?.env
      expect(env).toBeDefined()
      expect(env?.["COS_SID"]).toBe("sid-test-12345")
    })

    it("save で profile が COS_TARGET 環境変数経由で渡される", async () => {
      const { spawner, getCall } = captureSpawner("", "", 0)
      const store = new WindowsKeychainStore(spawner)
      await store.save("個人アカウント", "sid-test-12345")

      // COS_TARGET 環境変数に profile が設定されることを確認する
      const env = getCall(0).options?.env
      expect(env?.["COS_TARGET"]).toBe("coscli:個人アカウント")
    })

    it("exit code 非 0 のときエラーを throw する", async () => {
      const { spawner } = captureSpawner("", "PowerShell エラー", 1)
      const store = new WindowsKeychainStore(spawner)
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow(
        "Windows Credential Manager への保存に失敗しました",
      )
    })

    it("exit code 2 のとき CredentialManager 未インストールのエラーを throw する", async () => {
      const credManagerNotFoundStderr =
        "CredentialManager module not found. Install it with: Install-Module CredentialManager -Scope CurrentUser"
      const { spawner } = captureSpawner("", credManagerNotFoundStderr, 2)
      const store = new WindowsKeychainStore(spawner)
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow("Install-Module")
    })
  })

  describe("load", () => {
    it("powershell を呼び出して SID を返す", async () => {
      const { spawner, getCall } = captureSpawner("sid-abc-123", "", 0)
      const store = new WindowsKeychainStore(spawner)
      const result = await store.load("個人アカウント")

      // コマンドが powershell であることを確認する
      expect(getCall(0).cmd[0]).toBe("powershell")
      expect(result).toBe("sid-abc-123")
    })

    it("PowerShell スクリプト本体に profile 値が文字列補間されていない", async () => {
      const { spawner, getCall } = captureSpawner("sid-abc", "", 0)
      const store = new WindowsKeychainStore(spawner)
      await store.load("個人アカウント")

      const cmd = getCall(0).cmd
      const scriptArg = cmd.find((arg) => arg.includes("Get-StoredCredential")) ?? ""

      // スクリプトに profile 値がハードコードされていないことを確認する
      expect(scriptArg).not.toContain("個人アカウント")
      // 環境変数名 COS_TARGET を明示的に参照していることを確認する
      expect(scriptArg).toContain("$env:COS_TARGET")
    })

    it("profile 値が COS_TARGET 環境変数として spawner に渡される", async () => {
      const { spawner, getCall } = captureSpawner("sid-abc", "", 0)
      const store = new WindowsKeychainStore(spawner)
      await store.load("個人アカウント")

      // env の COS_TARGET に正確な値が設定されていることを確認する
      const env = getCall(0).options?.env
      expect(env).toBeDefined()
      expect(env?.["COS_TARGET"]).toBe("coscli:個人アカウント")
    })

    it("exit code 非 0 のとき null を返す", async () => {
      const { spawner } = captureSpawner("", "PowerShell エラー", 1)
      const store = new WindowsKeychainStore(spawner)
      expect(await store.load("存在しないプロファイル")).toBeNull()
    })

    it("stdout が空文字列のとき null を返す", async () => {
      const { spawner } = captureSpawner("   ", "", 0)
      const store = new WindowsKeychainStore(spawner)
      expect(await store.load("テストプロファイル")).toBeNull()
    })

    it("exit code 2 のとき CredentialManager 未インストールのエラーを throw する", async () => {
      const credManagerNotFoundStderr =
        "CredentialManager module not found. Install it with: Install-Module CredentialManager -Scope CurrentUser"
      const { spawner } = captureSpawner("", credManagerNotFoundStderr, 2)
      const store = new WindowsKeychainStore(spawner)
      await expect(store.load("テストプロファイル")).rejects.toThrow("Install-Module")
    })
  })

  describe("delete", () => {
    it("cmdkey /delete:coscli:<profile> を呼び出す", async () => {
      const { spawner, getCall } = captureSpawner("", "", 0)
      const store = new WindowsKeychainStore(spawner)
      await store.delete("個人アカウント")

      expect(getCall(0).cmd).toEqual(["cmdkey", "/delete:coscli:個人アカウント"])
    })

    it("exit code 非 0 でも例外を throw しない (存在しない場合も成功扱い)", async () => {
      const { spawner } = captureSpawner("", "", 1)
      const store = new WindowsKeychainStore(spawner)
      await expect(store.delete("存在しないプロファイル")).resolves.toBeUndefined()
    })
  })

  describe("list", () => {
    it("cmdkey /list の出力をパースして coscli のプロファイル一覧を返す", async () => {
      const listOutput = [
        "Credential Manager に格納されている資格情報",
        "",
        "Target: coscli:個人アカウント",
        "Type: Generic",
        "User: cos",
        "",
        "Target: coscli:仕事アカウント",
        "Type: Generic",
        "User: cos",
        "",
        "Target: other-app:other",
        "Type: Generic",
      ].join("\n")

      const { spawner } = captureSpawner(listOutput, "", 0)
      const store = new WindowsKeychainStore(spawner)
      const profiles = await store.list()

      expect(profiles).toContain("個人アカウント")
      expect(profiles).toContain("仕事アカウント")
      expect(profiles).not.toContain("other")
    })

    it("LegacyGeneric:target= プレフィックス付きフォーマット (Windows Server 2022 等) でも正しくパースできる", async () => {
      // Windows 環境では cmdkey /list が "LegacyGeneric:target=<actual-target>" 形式で出力することがある
      const listOutput = [
        "Currently stored credentials:",
        "",
        "    Target: LegacyGeneric:target=coscli:個人アカウント",
        "    Type: Generic",
        "    User: cos",
        "    Local machine persistence",
        "",
        "    Target: LegacyGeneric:target=coscli:仕事アカウント",
        "    Type: Generic",
        "    User: cos",
        "",
        "    Target: LegacyGeneric:target=other-app:other",
        "    Type: Generic",
      ].join("\n")

      const { spawner } = captureSpawner(listOutput, "", 0)
      const store = new WindowsKeychainStore(spawner)
      const profiles = await store.list()

      // 検証: LegacyGeneric プレフィックスが除去され正しいプロファイル名が返る
      expect(profiles).toContain("個人アカウント")
      expect(profiles).toContain("仕事アカウント")
      expect(profiles).not.toContain("other")
    })

    it("exit code 非 0 のとき空配列を返す", async () => {
      const { spawner } = captureSpawner("", "エラー", 1)
      const store = new WindowsKeychainStore(spawner)
      expect(await store.list()).toEqual([])
    })
  })

  describe("未インストール検知 (ENOENT)", () => {
    it("save で powershell が見つからないとき専用エラーを throw する", async () => {
      const store = new WindowsKeychainStore(enoentSpawner())
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow("PowerShell")
    })

    it("load で powershell が見つからないとき専用エラーを throw する", async () => {
      const store = new WindowsKeychainStore(enoentSpawner())
      await expect(store.load("テストプロファイル")).rejects.toThrow("PowerShell")
    })

    it("delete で cmdkey が見つからないとき専用エラーを throw する", async () => {
      const store = new WindowsKeychainStore(enoentSpawner())
      await expect(store.delete("テストプロファイル")).rejects.toThrow("cmdkey")
    })

    it("list で cmdkey が見つからないとき専用エラーを throw する", async () => {
      const store = new WindowsKeychainStore(enoentSpawner())
      await expect(store.list()).rejects.toThrow("cmdkey")
    })

    it("save のエラーメッセージに --insecure-file-store の案内が含まれる", async () => {
      const store = new WindowsKeychainStore(enoentSpawner())
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow(
        "--insecure-file-store",
      )
    })
  })
})
