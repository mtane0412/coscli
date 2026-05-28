/**
 * plain.ts — デフォルト / TSV 出力フォーマット。
 *
 * cli-table3 で罫線なしのスペースパディング整列テキスト (gogcli 風) を描画するか、
 * タブ区切り (TSV) で出力するかを選択できる。
 * デフォルト出力は人間にも AI エージェントにも読みやすい整列テキスト。
 * スクリプト連携には --plain (TSV) を使用する。
 *
 * cli-table3 は @colors/colors の TTY 検出に依存するため --color always/never を直接制御できない。
 * ヘッダーを picocolors で色付けし、cli-table3 のネイティブスタイルは常に無効化することで
 * isColorEnabled() の設定を確実に反映する。
 */

import { color, isColorEnabled } from "@/infra/color"
import Table from "cli-table3"

/** PlainOutputOptions はテキスト出力のオプション。 */
export interface PlainOutputOptions {
  /** 出力先 (デフォルト process.stdout) */
  stream?: NodeJS.WritableStream
  /** true の場合ヘッダー行を出力しない */
  noHeader?: boolean
}

/**
 * writePlainTable は cli-table3 を使って罫線なしのスペースパディング整列テキストを出力する。
 * gogcli 風の整列テキストで、人間にも AI エージェントにもトークン効率よく読める。
 *
 * cli-table3 のネイティブスタイルは常に無効化し、ヘッダーを picocolors で色付けする。
 * これにより --color never/always の設定が非 TTY 環境でも確実に反映される。
 */
export function writePlainTable(
  headers: string[],
  rows: string[][],
  opts: PlainOutputOptions = {},
): void {
  const stream = opts.stream ?? process.stdout
  // cli-table3 は @colors/colors の TTY 検出に依存するため --color always でも
  // 非 TTY 環境では ANSI を出力しない。ヘッダーを picocolors で色付けすることで
  // isColorEnabled() の設定を確実に反映する。
  const styledHeaders = isColorEnabled() ? headers.map((h) => color.bold(h)) : headers
  const table = new Table({
    head: styledHeaders,
    style: {
      head: [] as string[],
      border: [] as string[],
      "padding-left": 0,
      "padding-right": 2,
    },
    // 全ての罫線文字を空文字に設定し、列間はスペース 2 文字で区切る
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      left: "",
      "left-mid": "",
      mid: "",
      "mid-mid": "",
      right: "",
      "right-mid": "",
      middle: "  ",
    },
  })
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
