/**
 * profile.ts — keychain プロファイル名のバリデーション。
 *
 * secret-tool / cmdkey / PowerShell に安全に渡せるプロファイル名かどうかを検証する。
 * コマンドインジェクション・引数解釈の混乱・パース破壊を防ぐために使用する。
 */

/** MAX_PROFILE_LENGTH は全プラットフォームで安全に扱える最大プロファイル名長。 */
export const MAX_PROFILE_LENGTH = 255

/** FORBIDDEN_CHARS は明示的に禁止する印字可能文字の一覧。 */
const FORBIDDEN_CHARS = "'\":/"

/**
 * hasInvalidChar はプロファイル名に使用できない文字が含まれているかを検査する。
 *
 * 禁止対象:
 * - 制御文字 (U+0000-U+001F, U+007F)
 * - シングルクォート / ダブルクォート (PowerShell スクリプトインジェクション回避)
 * - コロン (cmdkey の /generic:service:<profile> 構文破壊回避)
 * - スラッシュ (cmdkey の /<switch> 解釈との混同回避)
 */
function hasInvalidChar(profile: string): boolean {
  for (const char of profile) {
    const code = char.codePointAt(0) ?? 0
    // U+0000-U+001F (制御文字), U+007F (DEL)
    if (code <= 0x1f || code === 0x7f) return true
    if (FORBIDDEN_CHARS.includes(char)) return true
  }
  return false
}

/**
 * validateProfile はプロファイル名が keychain で安全に使用できる文字列かを検証する。
 * 問題がある場合はエラーを throw する。
 */
export function validateProfile(profile: string): void {
  if (profile.length === 0) {
    throw new Error("プロファイル名を空にすることはできません。")
  }

  if (profile.length > MAX_PROFILE_LENGTH) {
    throw new Error(
      `プロファイル名が長すぎます: ${profile.length} 文字 (最大 ${MAX_PROFILE_LENGTH} 文字)`,
    )
  }

  if (profile.startsWith("-")) {
    throw new Error(
      `プロファイル名を '-' で始めることはできません: "${profile}"\nsecret-tool / cmdkey がフラグと誤認します。`,
    )
  }

  if (profile !== profile.trim()) {
    throw new Error(`プロファイル名の先頭または末尾に空白を含めることはできません: "${profile}"`)
  }

  if (hasInvalidChar(profile)) {
    throw new Error(
      `プロファイル名に使用できない文字が含まれています: "${profile}"\n制御文字、引用符 (', ")、コロン (:)、スラッシュ (/) は使用できません。`,
    )
  }
}
