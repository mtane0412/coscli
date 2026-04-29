/**
 * linux.ts — Linux の secret-tool (libsecret) を使った TokenStore 実装。
 */

import type { TokenStore } from "@/core/auth/store"

const SERVICE = "coscli"

/** LinuxKeychainStore は Linux の secret-tool コマンド経由で Secret Service にアクセスする。 */
export class LinuxKeychainStore implements TokenStore {
  async save(profile: string, sid: string): Promise<void> {
    const proc = Bun.spawn(
      ["secret-tool", "store", "--label=coscli", "service", SERVICE, "account", profile],
      {
        stdin: new TextEncoder().encode(sid),
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`secret-tool への保存に失敗しました: ${stderr}`)
    }
  }

  async load(profile: string): Promise<string | null> {
    const proc = Bun.spawn(["secret-tool", "lookup", "service", SERVICE, "account", profile], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (exitCode !== 0) return null
    return stdout.trim() || null
  }

  async delete(profile: string): Promise<void> {
    const proc = Bun.spawn(["secret-tool", "clear", "service", SERVICE, "account", profile], {
      stdout: "pipe",
      stderr: "pipe",
    })
    await proc.exited
  }

  async list(): Promise<string[]> {
    const proc = Bun.spawn(["secret-tool", "search", "--all", "service", SERVICE], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (exitCode !== 0) return []

    const profiles: string[] = []
    for (const line of stdout.split("\n")) {
      const match = line.match(/attribute\.account\s*=\s*(.+)/)
      if (match?.[1]) profiles.push(match[1].trim())
    }
    return profiles
  }
}
