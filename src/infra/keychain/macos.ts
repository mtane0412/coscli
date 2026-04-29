/**
 * macos.ts — macOS Keychain (security コマンド) を使った TokenStore 実装。
 */

import type { TokenStore } from "@/core/auth/store"

const SERVICE = "coscli"

/** MacOSKeychainStore は macOS の security コマンド経由で Keychain にアクセスする。 */
export class MacOSKeychainStore implements TokenStore {
  async save(profile: string, sid: string): Promise<void> {
    // すでに存在する場合は update、なければ add
    const updateResult = await run([
      "security",
      "add-generic-password",
      "-s",
      SERVICE,
      "-a",
      profile,
      "-w",
      sid,
      "-U",
    ])
    if (!updateResult.success) {
      throw new Error(`Keychain への保存に失敗しました: ${updateResult.stderr}`)
    }
  }

  async load(profile: string): Promise<string | null> {
    const result = await run([
      "security",
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      profile,
      "-w",
    ])
    if (!result.success) return null
    return result.stdout.trim() || null
  }

  async delete(profile: string): Promise<void> {
    await run(["security", "delete-generic-password", "-s", SERVICE, "-a", profile])
    // 存在しない場合も成功扱いにする
  }

  async list(): Promise<string[]> {
    // security コマンドでサービス名を指定して全アカウント名を取得する
    const result = await run(["security", "dump-keychain"])
    if (!result.success) return []

    const lines = result.stdout.split("\n")
    const profiles: string[] = []
    let inCosenseEntry = false

    for (const line of lines) {
      if (line.includes(`"svce"<blob>="${SERVICE}"`)) {
        inCosenseEntry = true
      }
      if (inCosenseEntry && line.includes('"acct"<blob>=')) {
        const match = line.match(/"acct"<blob>="([^"]+)"/)
        if (match?.[1]) {
          profiles.push(match[1])
          inCosenseEntry = false
        }
      }
    }

    return profiles
  }
}

/** run は外部コマンドを実行してその結果を返す。 */
async function run(cmd: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { success: exitCode === 0, stdout, stderr }
}
