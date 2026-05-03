/**
 * md-to-scrapbox.ts — Markdown を Scrapbox 記法に変換する。
 *
 * 行ベースの正規表現処理で MD → Scrapbox テキストに変換する。
 * 依存ライブラリなし。Scrapbox が対応する記法の範囲でカバーする。
 */

/**
 * mdToScrapbox は Markdown テキストを Scrapbox 記法文字列に変換する。
 *
 * @param input Markdown テキスト
 */
export function mdToScrapbox(input: string): string {
  const lines = input.split("\n")
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // コードフェンスブロックの検出
    const fenceMatch = line?.match(/^```(.*)$/)
    if (fenceMatch) {
      const lang = fenceMatch[1] ?? ""
      const bodyLines: string[] = []
      i++
      while (i < lines.length && lines[i] !== "```") {
        bodyLines.push(lines[i] ?? "")
        i++
      }
      // code:lang\n 本文 (インデント付き)
      const codeHeader = `code:${lang}`
      const codeBody = bodyLines.map((l) => ` ${l}`).join("\n")
      result.push(codeBody ? `${codeHeader}\n${codeBody}` : codeHeader)
      i++
      continue
    }

    result.push(convertLine(line ?? ""))
    i++
  }

  return result.join("\n")
}

/** convertLine は 1 行の MD を Scrapbox 記法の 1 行に変換する。 */
function convertLine(line: string): string {
  // 見出し (# から ###### まで)
  const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
  if (headingMatch) {
    const level = headingMatch[1]?.length ?? 1
    const text = headingMatch[2] ?? ""
    return headingToScrapbox(level, text)
  }

  // 引用 (> text) — そのまま保持
  const quoteMatch = line.match(/^>\s?(.*)$/)
  if (quoteMatch) {
    return `> ${quoteMatch[1] ?? ""}`
  }

  // 番号付きリスト (1. text)
  const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/)
  if (orderedMatch) {
    return `\t${orderedMatch[1]}. ${orderedMatch[2]}`
  }

  // 箇条書きリスト (- text, * text)
  const unorderedMatch = line.match(/^[-*]\s+(.+)$/)
  if (unorderedMatch) {
    return `\t${unorderedMatch[1]}`
  }

  // インライン要素の変換
  return convertInline(line)
}

/**
 * headingToScrapbox は MD の見出しレベルを Scrapbox 装飾記法に変換する。
 * h1/h2 → [*** text], h3 → [** text], h4+ → [* text]
 */
function headingToScrapbox(level: number, text: string): string {
  if (level <= 2) return `[*** ${text}]`
  if (level === 3) return `[** ${text}]`
  return `[* ${text}]`
}

/** convertInline はインライン要素を含む行テキストを変換する。 */
function convertInline(text: string): string {
  let result = text

  // 先に **bold** / __bold__ を処理 (単一 * の前に)
  result = result.replace(/\*\*([^*]+)\*\*/g, "[* $1]")
  result = result.replace(/__([^_]+)__/g, "[* $1]")

  // *italic* / _italic_
  result = result.replace(/\*([^*]+)\*/g, "[/ $1]")
  result = result.replace(/_([^_]+)_/g, "[/ $1]")

  // ~~strikethrough~~
  result = result.replace(/~~([^~]+)~~/g, "[- $1]")

  // [text](url) → [url text]
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[$2 $1]")

  // <https://...> → [https://...]
  result = result.replace(/<(https?:\/\/[^>]+)>/g, "[$1]")

  // `inline code` — そのまま (Scrapbox も同じ記法)

  return result
}
