/**
 * command-classification.ts — coscli の全コマンドを read/write に分類するテーブルと
 * プロジェクト権限プリセット展開ヘルパー。
 *
 * read: Cosense に対して読み取りのみ行うコマンド
 * write: Cosense・設定・認証などに書き込みを行うコマンド
 *
 * プリセット展開:
 *   "read"      → read 系コマンドのみ enable
 *   "readwrite" → 全コマンド enable ("*")
 *   "none"      → 全コマンド disable ("*")
 */

/** READ_COMMANDS は読み取り系コマンドの一覧。 */
export const READ_COMMANDS: readonly string[] = [
  "auth.whoami",
  "config.get",
  "config.path",
  "convert",
  "exit-codes",
  "notation",
  "page.code",
  "page.context",
  "page.get",
  "page.history",
  "page.infobox",
  "page.line.get",
  "page.list",
  "page.snapshot.get",
  "page.snapshot.list",
  "page.table",
  "page.text",
  "page.url",
  "page.watch",
  "project.graph",
  "project.info",
  "project.list",
  "project.members",
  "project.search",
  "project.stream",
  "schema",
  "search",
  "sync.diff",
  "sync.pull",
  "watch-list.list",
]

/** WRITE_COMMANDS は書き込み系コマンドの一覧。 */
export const WRITE_COMMANDS: readonly string[] = [
  "auth.login",
  "auth.logout",
  "config.set",
  "page.append",
  "page.delete",
  "page.edit",
  "page.icon",
  "page.insert",
  "page.line.delete",
  "page.line.replace",
  "page.new",
  "page.pin",
  "page.prepend",
  "page.rename",
  "page.unpin",
  "page.update-links",
  "serve.rest",
  "sync.push",
  "watch-list.add",
  "watch-list.remove",
]

/** PermissionPreset はプロジェクト権限プリセットの型。 */
export type PermissionPreset = "read" | "readwrite" | "none"

/**
 * PresetExpansion はプリセット展開結果の型。
 * enable / disable はそれぞれ PolicyOptions に渡す配列。
 * undefined の場合はその制約を設けない。
 */
export interface PresetExpansion {
  enable: string[] | undefined
  disable: string[] | undefined
}

/** expandPermissionPreset はプリセット名を enable/disable 配列に展開した PresetExpansion を返す。 */
export function expandPermissionPreset(preset: PermissionPreset): PresetExpansion {
  switch (preset) {
    case "read":
      return { enable: [...READ_COMMANDS], disable: undefined }
    case "readwrite":
      return { enable: ["*"], disable: undefined }
    case "none":
      return { enable: undefined, disable: ["*"] }
  }
}
