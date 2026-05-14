/**
 * fsname.ts — タイトルがファイル名として安全かバリデートするユーティリティ。
 *
 * Cosense タイトルをローカルファイル名として使う前にチェックする。
 * Windows (FAT/NTFS)・macOS・Linux の共通制約を適用する。
 * 自動置換はせず、NG の場合は FilenameInvalidError を throw する。
 */

/** OS 禁則文字パターン: / \ : * ? " < > | */
const FORBIDDEN_PATTERN = /[/\\:*?"<>|]/

/** 予約名: . と .. はディレクトリトラバーサルの危険がある */
const RESERVED_NAMES = new Set([".", ".."])

/** Windows 予約デバイス名: 拡張子付きも含む (例: CON.txt) */
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i

/** FilenameInvalidError はファイル名として使用できないタイトルのエラー。 */
export class FilenameInvalidError extends Error {
  constructor(
    public readonly title: string,
    public readonly reason: string,
  ) {
    super(`タイトル "${title}" はファイル名として使用できません: ${reason}`)
    this.name = "FilenameInvalidError"
  }
}

/**
 * safeFsName はタイトルをバリデートして安全なファイル名として返す。
 * NG の場合は FilenameInvalidError を throw する。
 */
export function safeFsName(title: string): string {
  if (title.length === 0) {
    throw new FilenameInvalidError(title, "タイトルが空です")
  }
  if (RESERVED_NAMES.has(title)) {
    throw new FilenameInvalidError(title, `"${title}" は予約名です`)
  }
  const match = FORBIDDEN_PATTERN.exec(title)
  if (match !== null) {
    const char = match[0] as string
    throw new FilenameInvalidError(title, `禁則文字 "${char}" が含まれています`)
  }
  // 制御文字 (U+0000–U+001F) のチェック: charCodeAt でループして検出する
  for (let i = 0; i < title.length; i++) {
    const code = title.charCodeAt(i)
    if (code < 0x20) {
      const display = `U+${code.toString(16).padStart(4, "0").toUpperCase()}`
      throw new FilenameInvalidError(title, `禁則文字 ${display} が含まれています`)
    }
  }
  if (WINDOWS_RESERVED.test(title)) {
    throw new FilenameInvalidError(title, `"${title}" は Windows 予約デバイス名です`)
  }
  if (/[ .]$/.test(title)) {
    throw new FilenameInvalidError(title, "末尾にスペースまたはピリオドを使用できません")
  }
  return title
}
