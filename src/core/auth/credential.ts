/**
 * credential.ts — 認証情報 (Credential) のドメイン型と判別・構築関数。
 *
 * SID / PAT / SA Key の 3 種類の認証方式を統一的に扱う Credential タグ付きユニオン型を定義する。
 * 判別ロジック (pat_/cs_ プレフィックス) はこのモジュールに集約し、
 * 他のモジュールが独自に文字列マッチを行うことを排除する。
 */

// SID フォーマット: RFC 6265 cookie-octet に準拠した印字可能 ASCII
const SID_MAX_LENGTH = 4096
const SID_PATTERN = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/

// PAT フォーマット: pat_ + 64桁小文字16進数
const PAT_PATTERN = /^pat_[0-9a-f]{64}$/

// SA Key フォーマット: cs_ + 64桁小文字16進数
const SA_KEY_PATTERN = /^cs_[0-9a-f]{64}$/

/** CredentialKind は認証方式の種別。 */
export type CredentialKind = "sid" | "pat" | "sa"

/**
 * Credential は認証情報のタグ付きユニオン型。
 *
 * - sid: connect.sid Cookie。書き込み操作が可能な唯一の方式。defaultProject は省略可能。
 * - pat: Personal Access Token。読み取り専用。defaultProject は省略可能。
 * - sa: Service Account Key。読み取り専用。defaultProject は省略可能 (keychain 保存時は必須)。
 *   環境変数経由の匿名 SA Credential ではプロジェクトが不明な場合があるため省略可能とする。
 */
export type Credential =
  | { kind: "sid"; value: string; defaultProject?: string }
  | { kind: "pat"; value: string; defaultProject?: string }
  | { kind: "sa"; value: string; defaultProject?: string }

/** CredentialParseError は Credential の構築に失敗したことを表すエラー。 */
export class CredentialParseError extends Error {
  /** kind は失敗した検証の種別。 */
  readonly kind: string
  /** hint は修正方法を示すヒントメッセージ。 */
  readonly hint: string

  constructor(kind: string, message: string, hint: string) {
    super(message)
    this.name = "CredentialParseError"
    this.kind = kind
    this.hint = hint
  }
}

/**
 * detectCredentialKind は生の文字列値から認証方式の種別を判別する。
 *
 * プレフィックスのみで判別し、フォーマット検証は行わない。
 * pat_/cs_ 以外はすべて SID とみなす。空文字は "unknown" を返す。
 */
export function detectCredentialKind(raw: string): CredentialKind | "unknown" {
  if (raw.length === 0) return "unknown"
  if (raw.startsWith("pat_")) return "pat"
  if (raw.startsWith("cs_")) return "sa"
  // pat_/cs_ 以外は SID として扱う (SID のフォーマットは多様なため正のマッチは使わない)
  // ただし SID_PATTERN に合致しない値は parseCredential でエラーになる
  return "sid"
}

/**
 * parseCredential は生の文字列値を検証して Credential を構築する。
 *
 * @param raw - 認証情報の生の文字列値
 * @param opts.defaultProject - プロジェクト名。SA Key では必須。SID/PAT では省略可能。
 * @throws CredentialParseError フォーマット違反または SA Key で defaultProject 未指定の場合
 */
export function parseCredential(raw: string, opts?: { defaultProject?: string }): Credential {
  const kind = detectCredentialKind(raw)

  if (kind === "unknown") {
    throw new CredentialParseError(
      "UNKNOWN_KIND",
      "認証情報のフォーマットが不正です",
      "有効な SID、pat_ で始まる PAT、または cs_ で始まる SA Key を指定してください",
    )
  }

  if (kind === "pat") {
    if (!PAT_PATTERN.test(raw)) {
      throw new CredentialParseError(
        "INVALID_PAT",
        "Personal Access Token のフォーマットが不正です",
        "pat_ で始まる 68 文字 (pat_ + 64 桁小文字 16 進数) を指定してください",
      )
    }
    const cred: { kind: "pat"; value: string; defaultProject?: string } = {
      kind: "pat",
      value: raw,
    }
    if (opts?.defaultProject !== undefined) cred.defaultProject = opts.defaultProject
    return cred
  }

  if (kind === "sa") {
    if (!SA_KEY_PATTERN.test(raw)) {
      throw new CredentialParseError(
        "INVALID_SA",
        "Service Account キーのフォーマットが不正です",
        "cs_ で始まる 67 文字 (cs_ + 64 桁小文字 16 進数) を指定してください",
      )
    }
    const project = opts?.defaultProject
    if (!project || project.length === 0) {
      throw new CredentialParseError(
        "SA_PROJECT_REQUIRED",
        "Service Account Key にはプロジェクト名が必要です",
        "--project フラグまたは COS_PROJECT 環境変数でプロジェクト名を指定してください",
      )
    }
    return { kind: "sa", value: raw, defaultProject: project }
  }

  // kind === "sid"
  if (raw.length === 0 || raw.length > SID_MAX_LENGTH || !SID_PATTERN.test(raw)) {
    throw new CredentialParseError(
      "INVALID_SID",
      "SID のフォーマットが不正です",
      "改行・制御文字・空白を含まない印字可能 ASCII 文字列を指定してください",
    )
  }
  const cred: { kind: "sid"; value: string; defaultProject?: string } = { kind: "sid", value: raw }
  if (opts?.defaultProject !== undefined) cred.defaultProject = opts.defaultProject
  return cred
}

/**
 * canWrite は Credential が書き込み操作を実行できるかを返す。
 *
 * SID のみ書き込み可能。PAT と SA Key は読み取り専用。
 */
export function canWrite(cred: Credential): boolean {
  return cred.kind === "sid"
}

/**
 * isValidSaKeyFormat は SA Key の文字列フォーマット (cs_ + 64桁小文字16進数) のみを検証する。
 *
 * `parseCredential` と異なり project 不要。`assertValidServiceAccountKey` の内部で使用する。
 */
export function isValidSaKeyFormat(key: string): boolean {
  return SA_KEY_PATTERN.test(key)
}

/**
 * displayKind は Credential の種別を人間が読みやすい文字列で返す。
 */
export function displayKind(cred: Credential): string {
  switch (cred.kind) {
    case "sid":
      return "SID"
    case "pat":
      return "PAT"
    case "sa":
      return "Service Account"
  }
}
