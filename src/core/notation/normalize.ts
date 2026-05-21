/**
 * normalize.ts — Cosense 記法の正規化処理。
 *
 * Scrapbox/Cosense 記法における構造的な誤りを自動修正する関数群。
 * code: ブロック内の空行を " " (スペース) に変換することで、
 * コードブロックが意図せず途切れることを防ぐ。
 */

/** normalizeCodeBlockEmptyLines は code: ブロック内の空行を条件付きでスペースに正規化した行配列を返す。 */
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
