/**
 * index.ts — OS に応じた TokenStore 実装を返すファクトリ。
 *
 * OS を判定して macOS / Linux / Windows の keychain 実装を返す。
 * 未知の OS の場合のみファイルフォールバックに移行する。keychain 実行失敗時は各実装がエラーを throw する。
 */

import type { TokenStore } from "@/core/auth/store"
import { FileTokenStore } from "./file"
import { LinuxKeychainStore } from "./linux"
import { MacOSKeychainStore } from "./macos"
import { WindowsKeychainStore } from "./windows"

export type { TokenStore }
export { FileTokenStore, LinuxKeychainStore, MacOSKeychainStore, WindowsKeychainStore }

/** createTokenStore は現在の OS に最適な TokenStore インスタンスを返す。 */
export function createTokenStore(opts: { insecureFileStore?: boolean } = {}): TokenStore {
  if (opts.insecureFileStore) return new FileTokenStore()

  const platform = process.platform
  if (platform === "darwin") return new MacOSKeychainStore()
  if (platform === "linux") return new LinuxKeychainStore()
  if (platform === "win32") return new WindowsKeychainStore()

  // 未知の OS はファイルフォールバック
  return new FileTokenStore()
}
