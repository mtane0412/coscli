/**
 * keychain-factory.test.ts — createTokenStore ファクトリ関数のテスト。
 *
 * process.platform に応じて正しい TokenStore 実装が返されることを検証する。
 */

import { afterEach, describe, expect, it } from "bun:test"
import { FileTokenStore } from "@/infra/keychain/file"
import { createTokenStore } from "@/infra/keychain/index"
import { LinuxKeychainStore } from "@/infra/keychain/linux"
import { MacOSKeychainStore } from "@/infra/keychain/macos"
import { WindowsKeychainStore } from "@/infra/keychain/windows"

// process.platform を上書きして各 OS の分岐をテストする
function setPlatform(platform: string) {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
    writable: true,
  })
}

describe("createTokenStore", () => {
  const originalPlatform = process.platform

  afterEach(() => {
    setPlatform(originalPlatform)
  })

  it("darwin では MacOSKeychainStore を返す", () => {
    setPlatform("darwin")
    expect(createTokenStore()).toBeInstanceOf(MacOSKeychainStore)
  })

  it("linux では LinuxKeychainStore を返す", () => {
    setPlatform("linux")
    expect(createTokenStore()).toBeInstanceOf(LinuxKeychainStore)
  })

  it("win32 では WindowsKeychainStore を返す", () => {
    setPlatform("win32")
    expect(createTokenStore()).toBeInstanceOf(WindowsKeychainStore)
  })

  it("未知の OS では FileTokenStore にフォールバックする", () => {
    setPlatform("freebsd")
    expect(createTokenStore()).toBeInstanceOf(FileTokenStore)
  })

  it("opts.insecureFileStore が true のときは OS にかかわらず FileTokenStore を返す", () => {
    setPlatform("darwin")
    expect(createTokenStore({ insecureFileStore: true })).toBeInstanceOf(FileTokenStore)
  })
})
