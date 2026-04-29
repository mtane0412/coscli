/**
 * windows.ts — Windows の cmdkey コマンドを使った TokenStore 実装。
 */

import type { TokenStore } from "@/core/auth/store"

const SERVICE = "coscli"

/** WindowsKeychainStore は Windows の cmdkey コマンド経由で資格情報マネージャーにアクセスする。 */
export class WindowsKeychainStore implements TokenStore {
  async save(profile: string, sid: string): Promise<void> {
    const proc = Bun.spawn(
      ["cmdkey", `/generic:${SERVICE}:${profile}`, "/user:cos", `/pass:${sid}`],
      { stdout: "pipe", stderr: "pipe" },
    )
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`cmdkey への保存に失敗しました: ${stderr}`)
    }
  }

  async load(profile: string): Promise<string | null> {
    // Windows の cmdkey は直接値を読み出せないため PowerShell を使う
    const script = `
      $cred = Get-StoredCredential -Target '${SERVICE}:${profile}'
      if ($cred) { $cred.GetNetworkCredential().Password }
    `
    const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", script], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (exitCode !== 0) return null
    return stdout.trim() || null
  }

  async delete(profile: string): Promise<void> {
    const proc = Bun.spawn(["cmdkey", `/delete:${SERVICE}:${profile}`], {
      stdout: "pipe",
      stderr: "pipe",
    })
    await proc.exited
  }

  async list(): Promise<string[]> {
    const proc = Bun.spawn(["cmdkey", "/list"], { stdout: "pipe", stderr: "pipe" })
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (exitCode !== 0) return []

    const prefix = `${SERVICE}:`
    const profiles: string[] = []
    for (const line of stdout.split("\n")) {
      const match = line.match(/Target:\s*(.+)/)
      if (match?.[1]) {
        const target = match[1].trim()
        if (target.startsWith(prefix)) {
          profiles.push(target.slice(prefix.length))
        }
      }
    }
    return profiles
  }
}
