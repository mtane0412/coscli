/**
 * keychain-macos.test.ts — MacOSKeychainStore のユニットテスト。
 *
 * Spawner を差し替えて security コマンドの呼び出し引数と結果のパースを検証する。
 * 実際の macOS Keychain にはアクセスしない。
 */

import { describe, expect, it } from "bun:test"
import { MacOSKeychainStore } from "@/infra/keychain/macos"
import type { SpawnOptions, SubprocessLike } from "@/infra/keychain/spawner"

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

describe("MacOSKeychainStore", () => {
  describe("save", () => {
    it("security add-generic-password -U を呼び出す", async () => {
      const { spawner, calls, getCall } = captureSpawner("", "", 0)
      const store = new MacOSKeychainStore(spawner)
      await store.save("個人アカウント", "sid-test-12345")

      expect(calls).toHaveLength(1)
      expect(getCall(0).cmd).toEqual([
        "security",
        "add-generic-password",
        "-s",
        "coscli",
        "-a",
        "個人アカウント",
        "-w",
        "sid-test-12345",
        "-U",
      ])
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
      const dumpOutput = [
        'keychain: "/Users/ユーザー/Library/Keychains/login.keychain"',
        '    "svce"<blob>="coscli"',
        '    "acct"<blob>="個人アカウント"',
        '    "svce"<blob>="coscli"',
        '    "acct"<blob>="仕事アカウント"',
        '    "svce"<blob>="other-app"',
        '    "acct"<blob>="他のアプリ"',
      ].join("\n")

      const { spawner } = captureSpawner(dumpOutput, "", 0)
      const store = new MacOSKeychainStore(spawner)
      const profiles = await store.list()

      expect(profiles).toContain("個人アカウント")
      expect(profiles).toContain("仕事アカウント")
      expect(profiles).not.toContain("他のアプリ")
    })

    it("exit code 非 0 のとき空配列を返す", async () => {
      const { spawner } = captureSpawner("", "エラー", 1)
      const store = new MacOSKeychainStore(spawner)
      expect(await store.list()).toEqual([])
    })
  })
})
