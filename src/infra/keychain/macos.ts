/**
 * macos.ts — macOS Keychain (security コマンド) を使った TokenStore 実装。
 */

import type { TokenStore } from "@/core/auth/store"
import { validateProfile } from "./profile"
import { type SpawnOptions, type Spawner, type SubprocessLike, defaultSpawner } from "./spawner"

const SERVICE = "coscli"

/** MacOSKeychainStore は macOS の security コマンド経由で Keychain にアクセスする。 */
export class MacOSKeychainStore implements TokenStore {
  private readonly spawn: Spawner

  /** テストでは spawn に偽実装を渡すことで実コマンドを呼ばずに検証できる。 */
  constructor(spawn: Spawner = defaultSpawner) {
    this.spawn = spawn
  }

  async save(profile: string, sid: string): Promise<void> {
    validateProfile(profile)
    // すでに存在する場合は update、なければ add
    const result = await this.run([
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
    if (!result.success) {
      throw new Error(`Keychain への保存に失敗しました: ${result.stderr}`)
    }
  }

  async load(profile: string): Promise<string | null> {
    const result = await this.run([
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
    await this.run(["security", "delete-generic-password", "-s", SERVICE, "-a", profile])
    // 存在しない場合も成功扱いにする
  }

  async list(): Promise<string[]> {
    const result = await this.run(["security", "dump-keychain"])
    if (!result.success) return []

    // dump-keychain の出力は "keychain:" 行でエントリが区切られる。
    // 各ブロック内で "acct" は "svce" より前に出力されるためブロック単位でパースする。
    const profiles: string[] = []
    const blocks = result.stdout.split(/^keychain:/m)

    for (const block of blocks) {
      if (!block.includes(`"svce"<blob>="${SERVICE}"`)) continue

      // ASCII 形式: "acct"<blob>="account-name"
      const quotedMatch = block.match(/"acct"<blob>="([^"]+)"/)
      if (quotedMatch?.[1]) {
        profiles.push(quotedMatch[1])
        continue
      }

      // 16進数形式: "acct"<blob>=0xHEX (非 ASCII 文字列の UTF-8 バイト列表現)
      const hexMatch = block.match(/"acct"<blob>=0x([0-9A-Fa-f]+)/)
      if (hexMatch?.[1]) {
        const pairs = hexMatch[1].match(/.{2}/g)
        if (pairs) {
          const bytes = pairs.map((h) => Number.parseInt(h, 16))
          profiles.push(new TextDecoder().decode(new Uint8Array(bytes)))
        }
      }
    }

    return profiles
  }

  /** run は外部コマンドを実行してその結果を返す。 */
  private async run(
    cmd: string[],
    options?: SpawnOptions,
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    const proc: SubprocessLike = this.spawn(cmd, { stdout: "pipe", stderr: "pipe", ...options })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    return { success: exitCode === 0, stdout, stderr }
  }
}
