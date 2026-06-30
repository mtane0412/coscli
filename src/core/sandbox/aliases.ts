/**
 * sandbox/aliases.ts — sandbox 識別子の旧→新エイリアスマップ。
 *
 * deprecated 書き込み verb の旧識別子と新識別子 (`page.edit.preview`) の対応を定義する。
 * sandbox の enable/disable チェックで方向別 alias 解決に使用する。
 *
 * enable: 双方向 (旧 alias ↔ 新識別子)
 * disable: 旧→新の単方向のみ (旧 alias → 新識別子。逆方向は適用しない)
 */

/**
 * WRITE_DEPRECATED_ALIASES は旧書き込み verb の sandbox 識別子 → 新識別子マップ。
 *
 * キー: deprecated alias (旧識別子)
 * 値: 対応する新正規識別子
 */
export const WRITE_DEPRECATED_ALIASES: Readonly<Record<string, string>> = {
  "page.append.preview": "page.edit.preview",
  "page.prepend.preview": "page.edit.preview",
  "page.insert.preview": "page.edit.preview",
  "page.new.preview": "page.edit.preview",
  "page.line.replace.preview": "page.edit.preview",
  "page.line.delete.preview": "page.edit.preview",
}

/**
 * WRITE_DEPRECATED_ALIASES_REVERSE は新識別子 → 旧識別子セットの逆引きマップ。
 *
 * enable の双方向解決で使用する。
 */
export const WRITE_DEPRECATED_ALIASES_REVERSE: Readonly<Record<string, readonly string[]>> = {
  "page.edit.preview": [
    "page.append.preview",
    "page.prepend.preview",
    "page.insert.preview",
    "page.new.preview",
    "page.line.replace.preview",
    "page.line.delete.preview",
  ],
}
