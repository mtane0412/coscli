/**
 * plain.ts — --plain / TSV 出力フォーマット。
 *
 * cli-table3 でボーダー付きテーブルを描画するか、
 * タブ区切り (TSV) で出力するかを選択できる。
 * AI エージェントやスクリプトには TSV が扱いやすい。
 */

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
 */
export function writePlainTable(
  headers: string[],
  rows: string[][],
  opts: PlainOutputOptions = {},
): void {
  const stream = opts.stream ?? process.stdout
  const table = new Table({ head: headers })
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
