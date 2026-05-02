/**
 * diff.ts — ローカルとリモートの行差分を計算する LCS ベースのユーティリティ。
 *
 * Cosense ページは数百行スケールなので O(n*m) LCS で十分。
 * 外部依存を追加せずに実装する。
 */

/** DiffStatus は2つのテキスト間の同期状態を示す。 */
export type DiffStatus = "in-sync" | "modified"

/** LineDiff は変更された行の詳細。 */
export interface LineDiff {
  /** 1-indexed のリモート上の行番号 */
  line: number
  /** 変更前 (リモート) の本文 */
  before: string
  /** 変更後 (ローカル) の本文 */
  after: string
}

/** DiffResult は computeDiff の結果。 */
export interface DiffResult {
  status: DiffStatus
  /** ローカルに追加された行 (リモートに無い行) */
  added: string[]
  /** ローカルから削除された行 (リモートにあるがローカルに無い行) */
  removed: string[]
  /** 内容が変わった行 */
  modified: LineDiff[]
}

/**
 * computeDiff はローカル行配列とリモート行配列の差分を計算する。
 *
 * @param localLines ローカルファイルの行配列
 * @param remoteLines リモート (Cosense) の行配列
 */
export function computeDiff(localLines: string[], remoteLines: string[]): DiffResult {
  const lcs = computeLcs(localLines, remoteLines)

  const added: string[] = []
  const removed: string[] = []
  const modified: LineDiff[] = []

  let li = 0 // localLines のポインタ
  let ri = 0 // remoteLines のポインタ
  let lcsIdx = 0 // lcs のポインタ

  while (li < localLines.length || ri < remoteLines.length) {
    const localLine = localLines[li]
    const remoteLine = remoteLines[ri]
    const lcsLine = lcs[lcsIdx]

    if (
      localLine !== undefined &&
      remoteLine !== undefined &&
      localLine === lcsLine &&
      remoteLine === lcsLine
    ) {
      // 両側が LCS と一致 → 変更なし
      li++
      ri++
      lcsIdx++
    } else if (remoteLine !== undefined && remoteLine === lcsLine) {
      // リモートが LCS と一致しているがローカルが不一致 → ローカルに追加
      added.push(localLine as string)
      li++
    } else if (localLine !== undefined && localLine === lcsLine) {
      // ローカルが LCS と一致しているがリモートが不一致 → リモートが削除されている (ローカル視点では削除)
      removed.push(remoteLine as string)
      ri++
    } else if (localLine !== undefined && remoteLine !== undefined) {
      // 両側とも LCS と不一致 → 変更
      modified.push({ line: ri + 1, before: remoteLine, after: localLine })
      li++
      ri++
    } else if (localLine !== undefined) {
      // リモートが終わったがローカルはまだある → ローカルに追加
      added.push(localLine)
      li++
    } else {
      // ローカルが終わったがリモートはまだある → ローカルから削除
      removed.push(remoteLine as string)
      ri++
    }
  }

  const status: DiffStatus =
    added.length === 0 && removed.length === 0 && modified.length === 0 ? "in-sync" : "modified"

  return { status, added, removed, modified }
}

/**
 * computeLcs は2つの文字列配列の最長共通部分列 (LCS) を返す。
 * O(n*m) の動的計画法で実装する。
 */
function computeLcs(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length

  // dp[i][j] = a[0..i-1] と b[0..j-1] の LCS 長
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const dpI = dp[i]
      const dpI1 = dp[i - 1]
      if (dpI === undefined || dpI1 === undefined) continue
      if (a[i - 1] === b[j - 1]) {
        dpI[j] = (dpI1[j - 1] ?? 0) + 1
      } else {
        dpI[j] = Math.max(dpI1[j] ?? 0, dpI[j - 1] ?? 0)
      }
    }
  }

  // バックトラックで LCS を復元
  const lcs: string[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1] as string)
      i--
      j--
    } else if ((dp[i - 1]?.[j] ?? 0) > (dp[i]?.[j - 1] ?? 0)) {
      i--
    } else {
      j--
    }
  }

  return lcs
}
