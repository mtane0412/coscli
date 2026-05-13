/**
 * file.ts — ファイルベースの TokenStore フォールバック実装。
 *
 * OS の keychain が利用できない環境向けに、
 * ~/.config/coscli/secrets.json にセッション ID を保存する。
 * このストアは平文保存なので --insecure-file-store フラグを明示した場合のみ使用する。
 *
 * セキュリティ対策:
 * - ディレクトリを 0o700、ファイルを 0o600 で作成/更新する
 * - アトミック書き込み (tmp→rename) でクラッシュによる部分書き込みを防ぐ
 * - JSON 破損時は silent return せず throw して上書きによるデータ消失を防ぐ
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { TokenStore } from "@/core/auth/store"

/** FileTokenStore はファイルに平文で connect.sid を保存する (フォールバック用)。 */
export class FileTokenStore implements TokenStore {
  constructor(private readonly filePath: string = defaultSecretsPath()) {}

  async save(profile: string, sid: string): Promise<void> {
    // read() は破損ファイルで throw する (上書きによるデータ消失を防ぐ)
    const data = this.read()
    data[profile] = sid
    this.write(data)
  }

  async load(profile: string): Promise<string | null> {
    try {
      const data = this.read()
      return data[profile] ?? null
    } catch {
      return null
    }
  }

  async delete(profile: string): Promise<void> {
    const data = this.read()
    delete data[profile]
    this.write(data)
  }

  async list(): Promise<string[]> {
    try {
      return Object.keys(this.read())
    } catch {
      return []
    }
  }

  private read(): Record<string, string> {
    if (!existsSync(this.filePath)) return {}
    // 破損ファイルの上書きによるデータ消失を防ぐため、パース失敗は呼び出し元に伝播する
    const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf-8"))
    // プレーンオブジェクト + 値がすべて string 以外は不正形式として弾く
    // ([] は string キーを stringify で落とすため save が成功に見えてデータ消失する)
    if (
      parsed === null ||
      Array.isArray(parsed) ||
      typeof parsed !== "object" ||
      Object.values(parsed).some((value) => typeof value !== "string")
    ) {
      throw new Error("secrets.json の形式が不正です")
    }
    return parsed as Record<string, string>
  }

  private write(data: Record<string, string>): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    } else {
      // 既存ディレクトリのパーミッションを 0o700 に絞り込む (Windows では無視)
      try {
        chmodSync(dir, 0o700)
      } catch {
        // Windows では chmod は無効操作のため無視する
      }
    }
    // アトミック書き込み: 一時ファイル経由で rename することでクラッシュによる部分書き込みを防ぐ
    const rand = Math.random().toString(36).slice(2)
    const tmp = `${this.filePath}.${process.pid}.${rand}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
    try {
      renameSync(tmp, this.filePath)
    } catch (err) {
      // rename 失敗時は tmp を削除してエラーを再スロー
      try {
        unlinkSync(tmp)
      } catch {
        // ベストエフォート: 削除できなくても元のエラーを優先する
      }
      throw err
    }
  }
}

/** defaultSecretsPath は OS の規約に従ったデフォルト保存パスを返す。 */
function defaultSecretsPath(): string {
  const xdgConfig = process.env["XDG_CONFIG_HOME"]
  const base = xdgConfig ?? join(homedir(), ".config")
  return join(base, "coscli", "secrets.json")
}
