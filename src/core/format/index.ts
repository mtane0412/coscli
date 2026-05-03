/**
 * index.ts — Scrapbox 記法 ↔ Markdown 相互変換のエントリポイント。
 *
 * convert() 関数を通じて変換方向とオプションを指定する。
 */

import { mdToScrapbox } from "@/core/format/md-to-scrapbox"
import {
  type BoldStyle,
  type ScrapboxToMdOptions,
  scrapboxToMd,
} from "@/core/format/scrapbox-to-md"

export type FormatKind = "scrapbox" | "md"
export type { BoldStyle }

/** ConvertOptions は変換オプション。 */
export interface ConvertOptions {
  /** Scrapbox→MD 変換時の太字記法解釈 (デフォルト: "auto") */
  boldStyle?: BoldStyle
}

/**
 * convert は Scrapbox 記法と Markdown を相互変換する。
 *
 * @param text 入力テキスト
 * @param from 入力フォーマット
 * @param to 出力フォーマット
 * @param opts 変換オプション
 * @throws {Error} from === to のとき SAME_FORMAT_ERROR をメッセージに含む Error を throw する
 */
export function convert(
  text: string,
  from: FormatKind,
  to: FormatKind,
  opts?: ConvertOptions,
): string {
  if (from === to) {
    throw new Error(`SAME_FORMAT_ERROR: from と to が同じフォーマット (${from}) です`)
  }

  if (from === "scrapbox" && to === "md") {
    const sbOpts: ScrapboxToMdOptions = {}
    if (opts?.boldStyle !== undefined) sbOpts.boldStyle = opts.boldStyle
    return scrapboxToMd(text, sbOpts)
  }

  // from === "md" && to === "scrapbox"
  return mdToScrapbox(text)
}
