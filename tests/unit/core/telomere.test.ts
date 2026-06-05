/**
 * telomere.test.ts — テロメア集計ロジックのテスト。
 *
 * ページ行配列（Line[]）をユーザーID単位で集計し、
 * 「誰が何行、いつ最後に更新したか」を返す buildTelomere 関数を検証する。
 */

import { describe, expect, it } from "bun:test"
import { buildTelomere } from "@/core/telomere"
import type { Line } from "@/schemas/page"

/** テスト用の行データを生成するヘルパー */
function makeLine(id: string, userId: string, updated: number, text = "テスト行"): Line {
  return { id, text, userId, created: 0, updated }
}

describe("buildTelomere", () => {
  it("空の行配列を渡すと空配列を返す", () => {
    const result = buildTelomere([], new Map())
    expect(result).toEqual([])
  })

  it("1人が書いた行のみの場合、そのユーザーの1エントリを返す", () => {
    const lines: Line[] = [
      makeLine("line1", "user-山田", 1000),
      makeLine("line2", "user-山田", 2000),
      makeLine("line3", "user-山田", 3000),
    ]
    const memberMap = new Map([["user-山田", "山田太郎"]])

    const result = buildTelomere(lines, memberMap)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      userId: "user-山田",
      displayName: "山田太郎",
      lineCount: 3,
      latestUpdated: 3000,
    })
  })

  it("複数ユーザーの行を正しく集計し、行数降順でソートして返す", () => {
    const lines: Line[] = [
      makeLine("line1", "user-山田", 1000),
      makeLine("line2", "user-鈴木", 2000),
      makeLine("line3", "user-山田", 3000),
      makeLine("line4", "user-鈴木", 4000),
      makeLine("line5", "user-鈴木", 5000),
    ]
    const memberMap = new Map([
      ["user-山田", "山田太郎"],
      ["user-鈴木", "鈴木次郎"],
    ])

    const result = buildTelomere(lines, memberMap)

    // 行数降順: 鈴木(3行) > 山田(2行)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      userId: "user-鈴木",
      displayName: "鈴木次郎",
      lineCount: 3,
      latestUpdated: 5000,
    })
    expect(result[1]).toEqual({
      userId: "user-山田",
      displayName: "山田太郎",
      lineCount: 2,
      latestUpdated: 3000,
    })
  })

  it("memberMap にないユーザーIDは displayName にユーザーID自体をセットする", () => {
    const lines: Line[] = [makeLine("line1", "unknown-user-id", 1000)]

    const result = buildTelomere(lines, new Map())

    expect(result[0]?.displayName).toBe("unknown-user-id")
  })

  it("latestUpdated は同一ユーザーの行の中で最も大きい updated を返す", () => {
    const lines: Line[] = [
      makeLine("line1", "user-山田", 5000),
      makeLine("line2", "user-山田", 1000),
      makeLine("line3", "user-山田", 3000),
    ]
    const memberMap = new Map([["user-山田", "山田太郎"]])

    const result = buildTelomere(lines, memberMap)

    expect(result[0]?.latestUpdated).toBe(5000)
  })
})
