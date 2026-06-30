/**
 * wrap-untrusted.ts — untrusted コンテンツのラッパー。
 *
 * AI エージェントが Cosense ページ本文を読む際に、
 * ページ内に仕込まれたプロンプトインジェクション攻撃を防ぐため、
 * 外部取得テキストを <external_content> タグで囲んで出力する。
 *
 * gog (Google CLI) の --wrap-untrusted 機能を参考にした実装。
 *
 * 使い方:
 *   --wrap-untrusted フラグが有効なとき、各コマンドは stdout に書き出す前に
 *   このモジュールの wrapUntrustedText() を呼ぶ。
 */

/**
 * wrapUntrustedText は外部取得テキストを <external_content> タグで囲む。
 *
 * @param text - Cosense から取得したページ本文や検索スニペット等の外部コンテンツ
 * @param source - コンテンツ取得元 (例: "cosense:myproject/ページ名")。省略可。
 * @returns タグで囲まれたテキスト
 */
export function wrapUntrustedText(text: string, source?: string): string {
  const sourceAttr = source !== undefined ? ` source="${source}"` : ""
  return `<external_content${sourceAttr}>\n${text}\n</external_content>`
}

/**
 * buildCosenseSource は Cosense ページの取得元文字列を組み立てる。
 *
 * @param project - Cosense プロジェクト名
 * @param title - ページタイトル
 * @returns "cosense:project/title" 形式の文字列
 */
export function buildCosenseSource(project: string, title: string): string {
  return `cosense:${project}/${title}`
}
