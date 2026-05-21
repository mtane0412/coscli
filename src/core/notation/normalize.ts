/**
 * normalize.ts — Cosense 記法の正規化処理。
 *
 * Scrapbox/Cosense 記法における構造的な誤りを自動修正する関数群。
 * code: ブロック内の空行を " " (スペース) に変換することで、
 * コードブロックが意図せず途切れることを防ぐ。
 */

/**
 * normalizeCodeBlockEmptyLines は Cosense 記法行配列を走査し、
 * code: ブロック内の空行 ("") をスペース1文字 (" ") に変換して返す。
 *
 * Scrapbox では空行はコードブロックを終了させるため、
 * ブロック内の空行は " " (スペース) で表現する必要がある。
 *
 * アルゴリズム (look-ahead):
 *   - /^code:/ で始まる行でブロック開始 (inCodeBlock = true)
 *   - 空行の場合、先読みで次の非空行がインデントされているかを確認する
 *     - インデントあり (/^[ \t]/) → ブロック継続中 → " " に変換
 *     - インデントなし or 行なし → ブロック終了 → そのまま出力し inCodeBlock = false
 *   - インデントのない非空行でブロック終了 (inCodeBlock = false)
 *
 * @param lines ページ本文の行配列
 * @returns 正規化後の行配列 (入力配列は変更しない)
 */
export function normalizeCodeBlockEmptyLines(lines: string[]): string[] {
  const result: string[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""

    if (!inCodeBlock) {
      if (/^code:/.test(line)) {
        inCodeBlock = true
      }
      result.push(line)
      continue
    }

    // inCodeBlock === true のとき
    if (line === "") {
      // 先読み: 次の非空行がインデントされているかを確認する
      const nextNonEmptyIndex = findNextNonEmpty(lines, i + 1)
      const nextNonEmpty = nextNonEmptyIndex !== -1 ? lines[nextNonEmptyIndex] : undefined
      if (nextNonEmpty !== undefined && /^[ \t]/.test(nextNonEmpty)) {
        // 次の非空行もコードブロック内 → スペースに変換してブロック継続
        result.push(" ")
      } else {
        // ブロック終了
        inCodeBlock = false
        result.push(line)
      }
    } else if (/^[ \t]/.test(line)) {
      // インデントあり → コードブロック継続行
      result.push(line)
    } else {
      // インデントなし非空行 → コードブロック終了
      inCodeBlock = false
      result.push(line)
    }
  }

  return result
}

/**
 * findNextNonEmpty は startIndex 以降の最初の非空行インデックスを返す。
 * 存在しない場合は -1 を返す。
 */
function findNextNonEmpty(lines: string[], startIndex: number): number {
  for (let i = startIndex; i < lines.length; i++) {
    if (lines[i] !== "") return i
  }
  return -1
}
