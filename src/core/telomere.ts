/**
 * telomere.ts — ページ行配列からテロメア情報を集計するコアロジック。
 *
 * テロメアとは、各行の最終更新者を集計した「誰が何行、いつ更新したか」の一覧。
 * エージェントが編集履歴の概要を把握するために使用する。
 */

import type { Line } from "@/schemas/page"

/** TelomereEntry は 1 ユーザー分のテロメア集計結果。 */
export type TelomereEntry = {
  userId: string
  /** memberMap にない場合は userId をそのまま使用する */
  displayName: string
  lineCount: number
  /** ユーザーが書いた行の中で最も新しい updated タイムスタンプ (unix 秒) */
  latestUpdated: number
}

/**
 * buildTelomere は行配列をユーザー単位で集計し、行数降順のテロメア一覧を返す。
 *
 * @param lines - ページ行配列
 * @param memberMap - userId → displayName のマッピング
 */
export function buildTelomere(lines: Line[], memberMap: Map<string, string>): TelomereEntry[] {
  const accum = new Map<string, { lineCount: number; latestUpdated: number }>()

  for (const line of lines) {
    const existing = accum.get(line.userId)
    if (existing) {
      existing.lineCount += 1
      if (line.updated > existing.latestUpdated) {
        existing.latestUpdated = line.updated
      }
    } else {
      accum.set(line.userId, { lineCount: 1, latestUpdated: line.updated })
    }
  }

  return [...accum.entries()]
    .map(([userId, { lineCount, latestUpdated }]) => ({
      userId,
      displayName: memberMap.get(userId) ?? userId,
      lineCount,
      latestUpdated,
    }))
    .sort((a, b) => b.lineCount - a.lineCount)
}
