/**
 * macos.ts — macOS Keychain (security コマンド) を使った TokenStore 実装。
 */

import type { TokenStore } from "@/core/auth/store"
import { validateProfile } from "./profile"
import { type SpawnOptions, type Spawner, type SubprocessLike, defaultSpawner } from "./spawner"

const SERVICE = "coscli"

/**
 * shellQuote は security -i コマンド行に渡す引数を single-quote でエスケープする。
 * シングルクォートは `'\''` に変換して安全に埋め込む。
 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

/** MacOSKeychainStore は macOS の security コマンド経由で Keychain にアクセスする。 */
export class MacOSKeychainStore implements TokenStore {
  private readonly spawn: Spawner

  /** テストでは spawn に偽実装を渡すことで実コマンドを呼ばずに検証できる。 */
  constructor(spawn: Spawner = defaultSpawner) {
    this.spawn = spawn
  }

  async save(profile: string, sid: string): Promise<void> {
    validateProfile(profile)
    // security -i モードでコマンドを stdin 経由で渡す。
    // argv は ["security", "-i"] のみで sid が ps に露出しない。
    const cmd = `add-generic-password -s ${shellQuote(SERVICE)} -a ${shellQuote(profile)} -w ${shellQuote(sid)} -U\n`
    const result = await this.run(["security", "-i"], { stdin: new TextEncoder().encode(cmd) })
    if (!result.success) {
      throw new Error(`Keychain への保存に失敗しました: ${result.stderr}`)
    }
  }

  async load(profile: string): Promise<string | null> {
    validateProfile(profile)
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
    validateProfile(profile)
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
    // TextDecoder はループ外で 1 度だけ生成して使い回す
    const decoder = new TextDecoder()

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
        const hex = hexMatch[1]
        // 奇数長の場合は不正な hex としてスキップ
        if (hex.length % 2 !== 0) continue
        const pairs = hex.match(/.{2}/g)
        if (pairs) {
          const bytes = pairs.map((h) => Number.parseInt(h, 16))
          profiles.push(decoder.decode(new Uint8Array(bytes)))
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
