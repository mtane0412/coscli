/**
 * version.ts — バージョン文字列のユーティリティ。
 *
 * bun build --define 'VERSION="vX.Y.Z"' でタグ名 (v-prefix 付き) が注入されるため、
 * citty の renderUsage が自動付加する "v" と重複して "vvX.Y.Z" になるのを防ぐ。
 */

/** normalizeVersion はバージョン文字列から先頭の v-prefix を除去して返す。 */
export function normalizeVersion(version: string): string {
  return version.replace(/^v/, "")
}
