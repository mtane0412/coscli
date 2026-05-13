/**
 * safe-read.ts — --from-file / stdin 向けの安全なファイル読み取りユーティリティ。
 *
 * AI エージェントや一般ユーザーが意図せず機密ファイル (~/.ssh/id_rsa, /etc/passwd 等)
 * を Cosense プロジェクトへ送信してしまう経路を防ぐ。
 *
 * 禁止ルール:
 *   - Unix: /etc, /proc, /sys, /dev, /root, /boot 等のシステムディレクトリ
 *   - Windows: C:\Windows\System32, C:\ProgramData, %USERPROFILE%\.ssh 等
 *   - *.pem, *.key, *.env, *_rsa, *_ed25519, *_ecdsa, *_dsa の機密拡張子
 *   - .ssh, .aws, .gnupg, coscli/secrets.json の機密ディレクトリ/ファイル (大文字小文字を区別しない)
 *   - シンボリックリンク解決後に上記に該当するパス
 *   - 10 MiB を超えるファイル
 *
 * allowUnsafe: true で禁止ルールをバイパスできる (--allow-unsafe-read フラグ向け)。
 */

import { readFileSync, statSync } from "node:fs"
import { realpathSync } from "node:fs"
import { sep } from "node:path"
import { platform } from "node:process"

/** ファイルの最大読み込みサイズ (10 MiB) */
const MAX_FROM_FILE_BYTES = 10 * 1024 * 1024

/** stdin の最大読み込みサイズ (10 MiB) */
const MAX_STDIN_BYTES = 10 * 1024 * 1024

/** Unix 向け禁止システムディレクトリの一覧 */
const UNIX_DENY_DIRS = ["/etc", "/proc", "/sys", "/dev", "/root", "/boot", "/run/secrets"]

/** Windows 向け禁止システムディレクトリの一覧 (環境変数を展開して生成) */
function buildWindowsDenyDirs(): string[] {
  const userProfile = process.env["USERPROFILE"] ?? ""
  const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows"
  const programData = process.env["ProgramData"] ?? "C:\\ProgramData"
  const dirs = [
    systemRoot,
    `${systemRoot}\\System32`,
    programData,
    `${userProfile}\\.ssh`,
    `${userProfile}\\.aws`,
    `${userProfile}\\AppData`,
  ]
  return dirs.filter((d) => d !== "" && d !== "\\.ssh" && d !== "\\.aws" && d !== "\\AppData")
}

/**
 * 禁止されたシステムディレクトリプレフィックスの一覧。
 * macOS の /etc → /private/etc のような OS レベルのシンボリックリンクも解決して追加する。
 * Windows 環境ではシステムディレクトリと機密ディレクトリを追加する。
 */
const DENY_DIRS = (platform === "win32" ? buildWindowsDenyDirs() : UNIX_DENY_DIRS).flatMap(
  (dir) => {
    try {
      const real = realpathSync(dir)
      return real !== dir ? [dir, real] : [dir]
    } catch {
      return [dir]
    }
  },
)

/** 禁止されたファイルサフィックスの一覧 */
const DENY_SUFFIXES = [".pem", ".key", ".env", "_rsa", "_ed25519", "_ecdsa", "_dsa"]

/** 禁止されたディレクトリ名の一覧 (パスのセグメントとして検索) */
const DENY_DIR_SEGMENTS = [".ssh", ".aws", ".gnupg"]

/** coscli 自身の認証ファイルのファイル名 */
const COSCLI_SECRETS_FILENAME = "secrets.json"

/** coscli の設定ディレクトリ名 */
const COSCLI_CONFIG_DIRNAME = "coscli"

/**
 * UnsafePathError は安全でないファイルパスへのアクセスを示すエラー。
 */
export class UnsafePathError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly reason: string,
  ) {
    super(`--from-file が許可されないパスです: ${filePath} (${reason})`)
    this.name = "UnsafePathError"
  }
}

/** readFromFileOpts は readFromFile のオプション。 */
export interface ReadFromFileOpts {
  /** true のとき禁止ルールをバイパスする (--allow-unsafe-read フラグ向け) */
  allowUnsafe?: boolean
}

/**
 * readFromFile は --from-file 引数で指定されたファイルを安全に読み込む。
 *
 * 元のパスとシンボリックリンクを解決した実パスの両方で禁止ルールを評価し、
 * 機密ファイルへのアクセスを防ぐ。
 * (macOS では /etc → /private/etc のような OS レベルのシンボリックリンクがあるため
 *  元パスと実パスの両方をチェックする)
 */
export function readFromFile(rawPath: string, opts: ReadFromFileOpts = {}): string {
  if (!opts.allowUnsafe) {
    const realPath = resolveRealPath(rawPath)
    // 元のパスでチェック (ユーザーが入力した文字列に禁止パターンが含まれる場合を検出)
    assertSafePath(rawPath, rawPath)
    // 実パスでチェック (シンボリックリンク解決後の行き先を検出)
    if (realPath !== rawPath) {
      assertSafePath(rawPath, realPath)
    }
    assertFileSize(rawPath, realPath)
  }

  return readFileSync(rawPath, "utf-8")
}

/**
 * readStdinBounded は stdin から安全にデータを読み込む。
 *
 * stdin の入力サイズを MAX_STDIN_BYTES に制限し、
 * メモリ枯渇や意図しない巨大データの Cosense 書き込みを防ぐ。
 */
export function readStdinBounded(): string {
  const buf = readFileSync(0)
  if (buf.byteLength > MAX_STDIN_BYTES) {
    throw new UnsafePathError("<stdin>", `stdin 入力が上限 ${MAX_STDIN_BYTES} バイトを超えています`)
  }
  return buf.toString("utf-8")
}

/**
 * resolveRealPath はシンボリックリンクを解決した実パスを返す。
 * 解決に失敗した場合 (ファイルが存在しない等) は元のパスを返す。
 */
function resolveRealPath(rawPath: string): string {
  try {
    return realpathSync(rawPath)
  } catch {
    return rawPath
  }
}

/**
 * assertSafePath は実パスが安全かどうかを検証し、
 * 禁止ルールに該当する場合は UnsafePathError をスローする。
 */
function assertSafePath(originalPath: string, realPath: string): void {
  // システムディレクトリのチェック
  for (const dir of DENY_DIRS) {
    if (realPath === dir || realPath.startsWith(`${dir}${sep}`) || realPath.startsWith(`${dir}/`)) {
      throw new UnsafePathError(
        originalPath,
        `禁止ディレクトリ ${dir} 配下のファイルは読み込めません`,
      )
    }
  }

  // 禁止サフィックスのチェック
  const lowerPath = realPath.toLowerCase()
  for (const suffix of DENY_SUFFIXES) {
    if (lowerPath.endsWith(suffix)) {
      throw new UnsafePathError(
        originalPath,
        `禁止された拡張子/サフィックス ${suffix} のファイルは読み込めません`,
      )
    }
  }

  // 禁止ディレクトリセグメントのチェック (大文字小文字を区別しない)
  const segments = realPath.split(sep)
  for (const segment of segments) {
    const lowerSegment = segment.toLowerCase()
    for (const denySegment of DENY_DIR_SEGMENTS) {
      if (lowerSegment === denySegment) {
        throw new UnsafePathError(
          originalPath,
          `禁止ディレクトリ ${denySegment} 配下のファイルは読み込めません`,
        )
      }
    }
  }

  // coscli 自身の secrets.json のチェック (大文字小文字を区別しない)
  if (
    segments.at(-1)?.toLowerCase() === COSCLI_SECRETS_FILENAME &&
    segments.at(-2)?.toLowerCase() === COSCLI_CONFIG_DIRNAME
  ) {
    throw new UnsafePathError(originalPath, "coscli の認証ファイルは読み込めません")
  }
}

/**
 * assertFileSize は実パスのファイルサイズを検証し、
 * 上限を超えている場合は UnsafePathError をスローする。
 */
function assertFileSize(originalPath: string, realPath: string): void {
  try {
    const st = statSync(realPath)
    if (st.size > MAX_FROM_FILE_BYTES) {
      throw new UnsafePathError(
        originalPath,
        `ファイルサイズ ${st.size} バイトが上限 ${MAX_FROM_FILE_BYTES} バイトを超えています`,
      )
    }
  } catch (err) {
    if (err instanceof UnsafePathError) throw err
    // stat 失敗 (ファイルなし等) は readFileSync のエラーに委ねる
  }
}
