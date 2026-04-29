/**
 * linux.ts — Linux の secret-tool (libsecret) を使った TokenStore 実装。
 *
 * secret-tool が未インストールの場合は専用のエラーメッセージを throw する。
 * テストでは Spawner を差し替えることで実コマンドを呼ばずに検証できる。
 */

import type { TokenStore } from "@/core/auth/store"
import { validateProfile } from "./profile"
import { type Spawner, type SubprocessLike, defaultSpawner } from "./spawner"

const SERVICE = "coscli"

const SECRET_TOOL_NOT_FOUND_MESSAGE =
  "secret-tool コマンドが見つかりません。\n" +
  "Ubuntu/Debian: sudo apt install libsecret-tools\n" +
  "Fedora: sudo dnf install libsecret\n" +
  "Arch Linux: sudo pacman -S libsecret\n" +
  "または cos auth login --insecure-file-store でファイル代替ストアを使用してください。"

/** isENOENT は ENOENT エラーかどうかを判定する型ガード。 */
function isENOENT(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT"
}

/** LinuxKeychainStore は Linux の secret-tool コマンド経由で Secret Service にアクセスする。 */
export class LinuxKeychainStore implements TokenStore {
  private readonly spawn: Spawner

  /** テストでは spawn に偽実装を渡すことで実コマンドを呼ばずに検証できる。 */
  constructor(spawn: Spawner = defaultSpawner) {
    this.spawn = spawn
  }

  async save(profile: string, sid: string): Promise<void> {
    validateProfile(profile)
    let proc: SubprocessLike
    try {
      proc = this.spawn(
        ["secret-tool", "store", "--label=coscli", "service", SERVICE, "account", profile],
        {
          stdin: new TextEncoder().encode(sid),
          stdout: "pipe",
          stderr: "pipe",
        },
      )
    } catch (e) {
      if (isENOENT(e)) throw new Error(SECRET_TOOL_NOT_FOUND_MESSAGE)
      throw e
    }
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`secret-tool への保存に失敗しました: ${stderr}`)
    }
  }

  async load(profile: string): Promise<string | null> {
    let proc: SubprocessLike
    try {
      proc = this.spawn(["secret-tool", "lookup", "service", SERVICE, "account", profile], {
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (e) {
      if (isENOENT(e)) throw new Error(SECRET_TOOL_NOT_FOUND_MESSAGE)
      throw e
    }
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (exitCode !== 0) return null
    return stdout.trim() || null
  }

  async delete(profile: string): Promise<void> {
    let proc: SubprocessLike
    try {
      proc = this.spawn(["secret-tool", "clear", "service", SERVICE, "account", profile], {
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (e) {
      if (isENOENT(e)) throw new Error(SECRET_TOOL_NOT_FOUND_MESSAGE)
      throw e
    }
    // clear の exit code は無視する (存在しない場合も成功扱い)
    await proc.exited
  }

  async list(): Promise<string[]> {
    let proc: SubprocessLike
    try {
      proc = this.spawn(["secret-tool", "search", "--all", "service", SERVICE], {
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (e) {
      if (isENOENT(e)) throw new Error(SECRET_TOOL_NOT_FOUND_MESSAGE)
      throw e
    }
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
