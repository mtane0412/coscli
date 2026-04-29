/**
 * file.ts — ファイルベースの TokenStore フォールバック実装。
 *
 * OS の keychain が利用できない環境向けに、
 * ~/.config/coscli/secrets.json にセッション ID を保存する。
 * このストアは平文保存なので --insecure-file-store フラグを明示した場合のみ使用する。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { TokenStore } from "@/core/auth/store"

/** FileTokenStore はファイルに平文で connect.sid を保存する (フォールバック用)。 */
export class FileTokenStore implements TokenStore {
  constructor(private readonly filePath: string = defaultSecretsPath()) {}

  async save(profile: string, sid: string): Promise<void> {
    const data = this.read()
    data[profile] = sid
    this.write(data)
  }

  async load(profile: string): Promise<string | null> {
    const data = this.read()
    return data[profile] ?? null
  }

  async delete(profile: string): Promise<void> {
    const data = this.read()
    delete data[profile]
    this.write(data)
  }

  async list(): Promise<string[]> {
    return Object.keys(this.read())
  }

  private read(): Record<string, string> {
    if (!existsSync(this.filePath)) return {}
    try {
      return JSON.parse(readFileSync(this.filePath, "utf-8")) as Record<string, string>
    } catch {
      return {}
    }
  }

  private write(data: Record<string, string>): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 })
  }
}

/** defaultSecretsPath は OS の規約に従ったデフォルト保存パスを返す。 */
function defaultSecretsPath(): string {
  const xdgConfig = process.env["XDG_CONFIG_HOME"]
  const base = xdgConfig ?? join(process.env["HOME"] ?? "~", ".config")
  return join(base, "coscli", "secrets.json")
}
