/**
 * sandbox.ts — コマンド実行許可ポリシー。
 *
 * --enable-commands / --disable-commands によって、
 * AI エージェントが実行できるコマンドを制限する。
 *
 * ルール:
 *   1. enable リストが指定された場合、そのリストのみ許可 (ワイルドカード "page" で "page.*" 全体)
 *   2. disable リストが指定された場合、そのエントリを拒否
 *   3. 両方指定時: enable で絞ってから disable で削る
 *
 * alias 解決 (PR 4 で追加):
 *   - enable は双方向: 旧 alias ↔ 新識別子 (例: "page.append.preview" ↔ "page.edit.preview")
 *   - disable は旧→新の単方向のみ: 旧 alias が disable にあれば新識別子も阻止するが逆は不可
 */

import { WRITE_DEPRECATED_ALIASES, WRITE_DEPRECATED_ALIASES_REVERSE } from "@/core/sandbox/aliases"

/** PolicyError は sandbox ポリシー違反を表すエラー。 */
export class PolicyError extends Error {
  constructor(public readonly command: string) {
    super(`[denied] ${command} is disabled by policy`)
    this.name = "PolicyError"
  }
}

/** PolicyOptions は createPolicy に渡す設定オプション。 */
export interface PolicyOptions {
  /** 許可するコマンドのリスト (例: ["page.list", "page.get"] または ["page"]) */
  enable?: string[]
  /** 拒否するコマンドのリスト */
  disable?: string[]
  /** カンマ区切り文字列での enable 指定 (CLI フラグ用) */
  enableStr?: string
  /** カンマ区切り文字列での disable 指定 (CLI フラグ用) */
  disableStr?: string
}

/** Policy は allow メソッドでコマンドの実行可否を判定する。 */
export interface Policy {
  /**
   * allow はコマンドが許可されているか判定する。
   * 許可の場合は undefined を返し、拒否の場合は PolicyError を返す。
   */
  allow(command: string): PolicyError | undefined
}

/**
 * createPolicy は PolicyOptions からポリシーインスタンスを生成する。
 * enable/disable が未指定の場合は全コマンドを許可する。
 */
export function createPolicy(opts: PolicyOptions): Policy {
  const enable = mergeList(opts.enable, opts.enableStr)
  const disable = mergeList(opts.disable, opts.disableStr)

  return {
    allow(command: string): PolicyError | undefined {
      // enable リストが空でなければ、許可リストでフィルタ (双方向 alias 解決)
      if (enable.length > 0 && !isAllowedBidirectional(command, enable)) {
        return new PolicyError(command)
      }
      // disable リストに含まれていれば拒否 (旧→新 単方向 alias 解決)
      if (disable.length > 0 && isAllowedWithOldToNewAlias(command, disable)) {
        return new PolicyError(command)
      }
      return undefined
    },
  }
}

/**
 * normalizeCommand はコマンド/パターン文字列を正規化する。
 * Unicode 空白文字 (\p{White_Space}) およびゼロ幅文字 (U+200B–U+200F) を除去して小文字化することで、
 * case-sensitive bypass や不可視文字混入による sandbox 迂回を防ぐ。
 */
function normalizeCommand(s: string): string {
  return s.replace(/[\p{White_Space}\u200B-\u200F]/gu, "").toLowerCase()
}

/** mergeList は配列とカンマ区切り文字列をマージして正規化する。 */
function mergeList(list: string[] | undefined, str: string | undefined): string[] {
  const fromList = list ?? []
  const fromStr = str
    ? str
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  return [...fromList, ...fromStr]
}

/**
 * isAllowed はコマンドがパターンリストにマッチするか判定する。
 *
 * - `*` / `all`: 全コマンドにマッチ
 * - `page.*`: page ドメインのすべてのコマンドにマッチ
 * - `page`: page.* 全体にマッチ (後方互換)
 * - `page.list`: 完全一致のみマッチ
 *
 * 比較前に両辺を normalizeCommand で正規化するため、大文字小文字・Unicode 空白文字を区別しない。
 * alias 解決は含まない。alias 解決が必要な場合は isAllowedBidirectional / isAllowedWithOldToNewAlias を使う。
 */
function isAllowed(command: string, patterns: string[]): boolean {
  const normalizedCmd = normalizeCommand(command)
  return patterns.some((pattern) => {
    const normalizedPattern = normalizeCommand(pattern)
    // ワイルドカード: * または all は全コマンドにマッチ
    if (normalizedPattern === "*" || normalizedPattern === "all") return true
    // 完全一致
    if (normalizedPattern === normalizedCmd) return true
    // "page.*" glob: page.* 全体にマッチ
    if (normalizedPattern.endsWith(".*")) {
      const prefix = normalizedPattern.slice(0, -2)
      if (normalizedCmd.startsWith(`${prefix}.`)) return true
    }
    // "page" ワイルドカード: page.list, page.delete 等にマッチ (後方互換)
    if (!normalizedPattern.includes(".") && normalizedCmd.startsWith(`${normalizedPattern}.`))
      return true
    return false
  })
}

/**
 * isAllowedBidirectional は双方向 alias を解決してコマンドがパターンにマッチするか判定する。
 *
 * enable チェックで使用する。旧 alias ↔ 新識別子の両方向を解決する。
 * 例: command = "page.edit.preview", patterns = ["page.append.preview"] → true
 *     command = "page.append.preview", patterns = ["page.edit.preview"] → true
 */
function isAllowedBidirectional(command: string, patterns: string[]): boolean {
  if (isAllowed(command, patterns)) return true
  // command が新識別子の場合: 旧 alias がパターンにあればマッチ
  const oldAliases = WRITE_DEPRECATED_ALIASES_REVERSE[command]
  if (oldAliases) {
    for (const oldAlias of oldAliases) {
      if (isAllowed(oldAlias, patterns)) return true
    }
  }
  // command が旧 alias の場合: 新識別子がパターンにあればマッチ
  const newCanonical = WRITE_DEPRECATED_ALIASES[command]
  if (newCanonical && isAllowed(newCanonical, patterns)) return true
  return false
}

/**
 * isAllowedWithOldToNewAlias は旧→新の単方向 alias を解決してコマンドがパターンにマッチするか判定する。
 *
 * disable チェックで使用する。旧 alias がパターンにある場合のみ新識別子もマッチする。
 * 逆方向 (新識別子がパターンにある場合に旧 alias もマッチ) は適用しない。
 *
 * 例: command = "page.edit.preview", patterns = ["page.append.preview"] → true (旧→新)
 *     command = "page.append.preview", patterns = ["page.edit.preview"] → false (逆方向は不可)
 */
function isAllowedWithOldToNewAlias(command: string, patterns: string[]): boolean {
  if (isAllowed(command, patterns)) return true
  // command が新識別子の場合: 旧 alias がパターンにあればマッチ (旧→新 方向)
  const oldAliases = WRITE_DEPRECATED_ALIASES_REVERSE[command]
  if (oldAliases) {
    for (const oldAlias of oldAliases) {
      if (isAllowed(oldAlias, patterns)) return true
    }
  }
  // NOTE: command が旧 alias の場合は新識別子へ展開しない (逆方向は適用しない)
  return false
}
