/**
 * capabilities.ts — 認証種別ごとの能力定義。
 *
 * coscli における認証要件の単一の事実ソース (Single Source of Truth)。
 * CLAUDE.md・README・SKILL.md の認証要件記述はこのファイルを参照する。
 *
 * ## 背景
 * coscli には 3 種類の認証方式があり、対応できる操作が異なる。
 *
 * - PAT (pat_xxxxx): v2 AI ops API (preview/submit 2 ステップ) への書き込みに対応。
 *   旧 WebSocket commit (page.delete/rename/pin/unpin/sync.push) は不可。
 *   CLAUDE.md の「PAT は読み取り系 REST のみ」という記述は移行前の状態であり、
 *   v2 AI ops API 導入後は書き込みも PAT で可能。
 *
 * - SID (connect.sid): 旧 WebSocket commit に対応。
 *   v2 AI ops API では requirePat() により exit 2 になるため不可。
 *
 * - SA (サービスアカウントキー): 読み取り系のみ対応。
 */

/** AuthKind は coscli が扱う認証種別。 */
export type AuthKind = "pat" | "sid" | "sa" | "any" | "none"

/**
 * AuthCapabilities は各認証種別が対応できる操作カテゴリを定義する。
 */
export interface AuthCapabilities {
  /** 認証種別 */
  kind: AuthKind
  /** 認証種別の説明 */
  description: string
  /** Cosense REST API 読み取りが可能か */
  canRead: boolean
  /**
   * v2 AI ops API への書き込みが可能か。
   *
   * 対象コマンド: page.edit.preview / page.edit.submit /
   * page.append.preview / page.prepend.preview / page.insert.preview /
   * page.new.preview / page.line.replace.preview / page.line.delete.preview
   */
  canWriteV2OpsAPI: boolean
  /**
   * 旧 WebSocket commit への書き込みが可能か。
   *
   * 対象コマンド: page.delete / page.rename / page.pin / page.unpin / sync.push
   */
  canWriteWebSocket: boolean
  /** ローカル設定ファイルの変更が可能か (Cosense API とは独立) */
  canWriteLocalConfig: boolean
}

/** AUTH_CAPABILITIES は認証種別ごとの能力マップ。 */
export const AUTH_CAPABILITIES: Record<AuthKind, AuthCapabilities> = {
  pat: {
    kind: "pat",
    description:
      "Personal Access Token (pat_ + 64桁小文字16進数)。" +
      "読み取り系 REST と v2 AI ops API (preview/submit) への書き込みに対応。" +
      "旧 WebSocket commit (delete/rename/pin/unpin/sync push) は使用不可。" +
      "ヘッダ: x-personal-access-token",
    canRead: true,
    canWriteV2OpsAPI: true,
    canWriteWebSocket: false,
    canWriteLocalConfig: false,
  },
  sid: {
    kind: "sid",
    description:
      "セッション Cookie (connect.sid)。" +
      "読み取り系 REST と旧 WebSocket commit に対応。" +
      "v2 AI ops API は requirePat() により PAT 専用のため使用不可 (exit 2)。",
    canRead: true,
    canWriteV2OpsAPI: false,
    canWriteWebSocket: true,
    canWriteLocalConfig: false,
  },
  sa: {
    kind: "sa",
    description:
      "サービスアカウントキー (cs_<project> 形式でキーチェーンに保存)。" +
      "読み取り系 REST のみ対応。v2 AI ops / WebSocket は使用不可。",
    canRead: true,
    canWriteV2OpsAPI: false,
    canWriteWebSocket: false,
    canWriteLocalConfig: false,
  },
  any: {
    kind: "any",
    description: "PAT / SID / SA のいずれかで利用可能。主に読み取り系コマンドで使用。",
    canRead: true,
    canWriteV2OpsAPI: false,
    canWriteWebSocket: false,
    canWriteLocalConfig: false,
  },
  none: {
    kind: "none",
    description:
      "認証不要。Cosense API を呼び出さないコマンドで使用 (config.get / schema / exit-codes / page.icon 等)。",
    canRead: false,
    canWriteV2OpsAPI: false,
    canWriteWebSocket: false,
    canWriteLocalConfig: true,
  },
}

/**
 * canWriteV2OpsAPI は指定した認証種別が v2 AI ops API への書き込みに対応しているか返す。
 *
 * @param kind - 確認する認証種別
 */
export function canWriteV2OpsAPI(kind: AuthKind): boolean {
  return AUTH_CAPABILITIES[kind].canWriteV2OpsAPI
}

/**
 * canWriteWebSocket は指定した認証種別が旧 WebSocket commit に対応しているか返す。
 *
 * @param kind - 確認する認証種別
 */
export function canWriteWebSocket(kind: AuthKind): boolean {
  return AUTH_CAPABILITIES[kind].canWriteWebSocket
}
