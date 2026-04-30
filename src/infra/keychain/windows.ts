/**
 * windows.ts — Windows の cmdkey コマンドを使った TokenStore 実装。
 *
 * load() の SID 読み出しは cmdkey が直接パスワードを返せないため
 * PowerShell + Get-StoredCredential (CredentialManager モジュール) を経由する。
 * profile 値は PowerShell スクリプトへの文字列補間を避けるため環境変数経由で渡す。
 * テストでは Spawner を差し替えることで実コマンドを呼ばずに検証できる。
 */

import type { TokenStore } from "@/core/auth/store"
import { validateProfile } from "./profile"
import { type Spawner, type SubprocessLike, defaultSpawner } from "./spawner"

const SERVICE = "coscli"

const CMDKEY_NOT_FOUND_MESSAGE =
  "cmdkey コマンドが見つかりません。\n" +
  "cmdkey は Windows 7 以降で標準提供されています。\n" +
  "または cos auth login --insecure-file-store でファイル代替ストアを使用してください。"

const POWERSHELL_NOT_FOUND_MESSAGE =
  "PowerShell が見つかりません。\n" +
  "PowerShell は Windows に標準インストールされています。\n" +
  "または cos auth login --insecure-file-store でファイル代替ストアを使用してください。"

const CREDENTIAL_MANAGER_INSTALL_MESSAGE =
  "Windows Credential Manager の読み出しに失敗しました。\n" +
  "PowerShell で次を実行してモジュールをインストールしてください:\n" +
  "  Install-Module CredentialManager -Scope CurrentUser\n" +
  "または cos auth login --insecure-file-store で代替ストアを使用してください。"

/** ENV_TARGET は PowerShell スクリプトへの安全な受け渡しに使う環境変数名。 */
const ENV_TARGET = "COS_TARGET"

/** isENOENT は ENOENT エラーかどうかを判定する型ガード。 */
function isENOENT(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && (e as NodeJS.ErrnoException).code === "ENOENT"
}

/** WindowsKeychainStore は Windows の cmdkey コマンド経由で資格情報マネージャーにアクセスする。 */
export class WindowsKeychainStore implements TokenStore {
  private readonly spawn: Spawner

  /** テストでは spawn に偽実装を渡すことで実コマンドを呼ばずに検証できる。 */
  constructor(spawn: Spawner = defaultSpawner) {
    this.spawn = spawn
  }

  async save(profile: string, sid: string): Promise<void> {
    validateProfile(profile)
    let proc: SubprocessLike
    try {
      proc = this.spawn(["cmdkey", `/generic:${SERVICE}:${profile}`, "/user:cos", `/pass:${sid}`], {
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (e) {
      if (isENOENT(e)) throw new Error(CMDKEY_NOT_FOUND_MESSAGE)
      throw e
    }
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`cmdkey への保存に失敗しました: ${stderr}`)
    }
  }

  async load(profile: string): Promise<string | null> {
    // cmdkey は直接パスワードを読み出せないため PowerShell + CredentialManager モジュールを試みる。
    // profile 値は文字列補間を避けるため環境変数 COS_TARGET 経由で渡す。
    const script = `
      if (-not (Get-Command Get-StoredCredential -ErrorAction SilentlyContinue)) {
        Write-Error 'CredentialManager module not found. Install it with: Install-Module CredentialManager -Scope CurrentUser'
        exit 2
      }
      $cred = Get-StoredCredential -Target $env:${ENV_TARGET}
      if ($cred) { $cred.GetNetworkCredential().Password }
    `
    let proc: SubprocessLike
    try {
      proc = this.spawn(["powershell", "-NoProfile", "-Command", script], {
        stdout: "pipe",
        stderr: "pipe",
        // process.env を展開して PATH / SystemRoot など Windows 必須変数を引き継ぐ
        env: { ...process.env, [ENV_TARGET]: `${SERVICE}:${profile}` },
      })
    } catch (e) {
      if (isENOENT(e)) throw new Error(POWERSHELL_NOT_FOUND_MESSAGE)
      throw e
    }
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (exitCode === 2) {
      throw new Error(`${CREDENTIAL_MANAGER_INSTALL_MESSAGE}\n詳細: ${stderr.trim()}`)
    }
    if (exitCode !== 0) return null
    return stdout.trim() || null
  }

  async delete(profile: string): Promise<void> {
    let proc: SubprocessLike
    try {
      proc = this.spawn(["cmdkey", `/delete:${SERVICE}:${profile}`], {
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (e) {
      if (isENOENT(e)) throw new Error(CMDKEY_NOT_FOUND_MESSAGE)
      throw e
    }
    // delete の exit code は無視する (存在しない場合も成功扱い)
    await proc.exited
  }

  async list(): Promise<string[]> {
    let proc: SubprocessLike
    try {
      proc = this.spawn(["cmdkey", "/list"], { stdout: "pipe", stderr: "pipe" })
    } catch (e) {
      if (isENOENT(e)) throw new Error(CMDKEY_NOT_FOUND_MESSAGE)
      throw e
    }
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (exitCode !== 0) return []

    const prefix = `${SERVICE}:`
    const profiles: string[] = []
    for (const line of stdout.split("\n")) {
      // Windows Server 2022 等では "LegacyGeneric:target=<actual>" 形式で出力される場合がある
      const match = line.match(/Target:\s*(?:LegacyGeneric:target=)?(.+)/)
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
