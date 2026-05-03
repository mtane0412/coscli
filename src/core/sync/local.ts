/**
 * local.ts — ローカルファイルの本文 IO と sha256 計算ユーティリティ。
 *
 * sync pull/push でローカルの .txt ファイルを読み書きする。
 * 行末の空行は trim してから読み込む (Cosense との往復で末尾改行が増殖しないように)。
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** localFilePath はローカルファイルのパスを返す。 */
function localFilePath(syncDir: string, title: string, format: "txt"): string {
  return join(syncDir, `${title}.${format}`)
}

/**
 * writeLocalContent は行配列をローカルファイルに書き込む。
 * 各行は改行で区切り、末尾に改行を付加する。
 */
export function writeLocalContent(
  syncDir: string,
  title: string,
  format: "txt",
  lines: string[],
): void {
  const filePath = localFilePath(syncDir, title, format)
  const content = lines.length === 0 ? "" : `${lines.join("\n")}\n`
  writeFileSync(filePath, content, "utf-8")
}

/**
 * readLocalContent はローカルファイルから行配列を読み込む。
 * ファイルが存在しない場合は null を返す。
 * 末尾の空行は除去する。
 */
export function readLocalContent(syncDir: string, title: string, format: "txt"): string[] | null {
  const filePath = localFilePath(syncDir, title, format)
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, "utf-8")
  // 末尾の空行を除去してから split
  const lines = content.replace(/\n+$/, "").split("\n")
  // 空ファイルは [""] になるので空配列に変換
  if (lines.length === 1 && lines[0] === "") return []
  return lines
}

/** sha256 は文字列の SHA-256 ハッシュ (hex) を返す。 */
export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex")
}

/** contentToString は行配列をファイル書き込み用文字列に変換する。 */
export function contentToString(lines: string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`
}
