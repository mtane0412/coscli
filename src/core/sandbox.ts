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
 */

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
      // enable リストが空でなければ、許可リストでフィルタ
      if (enable.length > 0 && !isAllowed(command, enable)) {
        return new PolicyError(command)
      }
      // disable リストに含まれていれば拒否
      if (disable.length > 0 && isAllowed(command, disable)) {
        return new PolicyError(command)
      }
      return undefined
    },
  }
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
 * パターンが "page" のように noun のみの場合、"page.*" 全体にマッチする。
 */
function isAllowed(command: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === command) return true
    // "page" は "page.list", "page.delete" 等にマッチ
    if (!pattern.includes(".") && command.startsWith(`${pattern}.`)) return true
    return false
  })
}
