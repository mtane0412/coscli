/**
 * keychain-windows.test.ts — WindowsKeychainStore のユニットテスト。
 *
 * Spawner を差し替えて cmdkey / PowerShell の呼び出し引数とパース処理を検証する。
 * 実際の cmdkey / CredentialManager にはアクセスしない。
 */

import { describe, expect, it } from "bun:test"
import type { SpawnOptions, SubprocessLike } from "@/infra/keychain/spawner"
import { WindowsKeychainStore } from "@/infra/keychain/windows"

type CapturedCall = { cmd: string[]; options: SpawnOptions | undefined }

/** fakeProcess は stdout / stderr / exited を返すプロセスの偽実装を生成する。 */
function fakeProcess(stdout: string, stderr: string, exitCode: number): SubprocessLike {
  return {
    stdout: new Response(stdout).body as ReadableStream<Uint8Array>,
    stderr: new Response(stderr).body as ReadableStream<Uint8Array>,
    exited: Promise.resolve(exitCode),
  }
}

/** captureSpawner は呼ばれた引数を記録しつつ指定の応答を返す偽 spawner を生成する。 */
function captureSpawner(stdout: string, stderr: string, exitCode: number) {
  const calls: CapturedCall[] = []
  const spawner = (cmd: string[], options?: SpawnOptions): SubprocessLike => {
    calls.push({ cmd, options })
    return fakeProcess(stdout, stderr, exitCode)
  }
  /** getCall は指定インデックスの呼び出し記録を返す。存在しない場合はエラーを throw する。 */
  function getCall(index: number): CapturedCall {
    const call = calls[index]
    if (call === undefined) throw new Error(`calls[${index}] が存在しません`)
    return call
  }
  return { spawner, calls, getCall }
}

describe("WindowsKeychainStore", () => {
  describe("save", () => {
    it("cmdkey /generic:coscli:<profile> を正しい引数で呼び出す", async () => {
      const { spawner, calls, getCall } = captureSpawner("", "", 0)
      const store = new WindowsKeychainStore(spawner)
      await store.save("個人アカウント", "sid-test-12345")

      expect(calls).toHaveLength(1)
      expect(getCall(0).cmd).toEqual([
        "cmdkey",
        "/generic:coscli:個人アカウント",
        "/user:cos",
        "/pass:sid-test-12345",
      ])
    })

    it("exit code 非 0 のときエラーを throw する", async () => {
      const { spawner } = captureSpawner("", "cmdkey エラー", 1)
      const store = new WindowsKeychainStore(spawner)
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow(
        "cmdkey への保存に失敗しました",
      )
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

      // 通常の安全なプロファイルでも env が使われることを確認する
      await store.load("個人アカウント")

      const cmd = getCall(0).cmd
      const scriptArg = cmd.find((arg) => arg.includes("Get-StoredCredential")) ?? ""

      // スクリプトに profile 値がハードコードされていないことを確認する
      expect(scriptArg).not.toContain("個人アカウント")
      // 環境変数参照を使っていることを確認する
      expect(scriptArg).toContain("$env:")
    })

    it("profile 値が環境変数経由で spawner に渡される", async () => {
      const { spawner, getCall } = captureSpawner("sid-abc", "", 0)
      const store = new WindowsKeychainStore(spawner)
      await store.load("個人アカウント")

      // env に COS_TARGET が含まれ、profile 値が設定されていることを確認する
      const env = getCall(0).options?.env
      expect(env).toBeDefined()
      expect(Object.values(env ?? {})).toContain("coscli:個人アカウント")
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

    it("exit code 非 0 のとき空配列を返す", async () => {
      const { spawner } = captureSpawner("", "エラー", 1)
      const store = new WindowsKeychainStore(spawner)
      expect(await store.list()).toEqual([])
    })
  })

  describe("未インストール検知 (ENOENT)", () => {
    /** ENOENT エラーを throw する偽 spawner を生成する。 */
    function enoentSpawner() {
      return (_cmd: string[], _options?: SpawnOptions): SubprocessLike => {
        const err = new Error("spawn cmdkey ENOENT") as NodeJS.ErrnoException
        err.code = "ENOENT"
        throw err
      }
    }

    it("save で cmdkey が見つからないとき専用エラーを throw する", async () => {
      const store = new WindowsKeychainStore(enoentSpawner())
      await expect(store.save("テストプロファイル", "sid-abc")).rejects.toThrow("cmdkey")
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
