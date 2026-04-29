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
    // security コマンドでサービス名を指定して全アカウント名を取得する
    const result = await this.run(["security", "dump-keychain"])
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
