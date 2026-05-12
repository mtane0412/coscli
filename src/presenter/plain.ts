/**
 * plain.ts — --plain / TSV 出力フォーマット。
 *
 * cli-table3 でボーダー付きテーブルを描画するか、
 * タブ区切り (TSV) で出力するかを選択できる。
 * AI エージェントやスクリプトには TSV が扱いやすい。
 *
 * cli-table3 は独自に ANSI エスケープコードを出力するため、
 * isColorEnabled() の値を style オプションとして渡すことで
 * --color never/always フラグを確実に反映する。
 */

import { isColorEnabled } from "@/infra/color"
import Table from "cli-table3"

/** PlainOutputOptions はテキスト出力のオプション。 */
export interface PlainOutputOptions {
  /** 出力先 (デフォルト process.stdout) */
  stream?: NodeJS.WritableStream
  /** true の場合ヘッダー行を出力しない */
  noHeader?: boolean
}

/**
 * writePlainTable は cli-table3 を使ってボーダー付きテーブルを出力する。
 * TTY 環境での人間向け表示に適する。
 *
 * cli-table3 は style.head / style.border で色付けを行う。
 * isColorEnabled() が false の場合は空配列を渡して ANSI コードを抑制する。
 */
export function writePlainTable(
  headers: string[],
  rows: string[][],
  opts: PlainOutputOptions = {},
): void {
  const stream = opts.stream ?? process.stdout
  // 色無効時は head/border スタイルを空にして ANSI コードを抑制する。
  // exactOptionalPropertyTypes のため、undefined を渡さずスプレッドで条件付きマージする。
  const tableOpts = isColorEnabled()
    ? { head: headers }
    : { head: headers, style: { head: [] as string[], border: [] as string[] } }
  const table = new Table(tableOpts)
  for (const row of rows) {
    table.push(row)
  }
  stream.write(`${table.toString()}\n`)
}

/**
 * writeTsv はタブ区切り (TSV) で出力する。
 * スクリプト連携や awk/cut での処理に適する。
 * セル値に含まれるタブは "\t" にエスケープする。
 */
export function writeTsv(headers: string[], rows: string[][], opts: PlainOutputOptions = {}): void {
  const stream = opts.stream ?? process.stdout
  const escapeCell = (s: string) => s.replace(/\t/g, "\\t").replace(/\n/g, "\\n")

  if (!opts.noHeader) {
    stream.write(`${headers.map(escapeCell).join("\t")}\n`)
  }
  for (const row of rows) {
    stream.write(`${row.map(escapeCell).join("\t")}\n`)
  }
}

/**
 * writePlainList は文字列のリストを1行ずつ出力する。
 * タイトル一覧などシンプルな値の列挙に使う。
 */
export function writePlainList(items: string[], opts: PlainOutputOptions = {}): void {
  const stream = opts.stream ?? process.stdout
  for (const item of items) {
    stream.write(`${item}\n`)
  }
}
