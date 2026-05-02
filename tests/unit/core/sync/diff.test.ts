/**
 * diff.test.ts — LCS 行差分ロジックのテスト。
 */

import { describe, expect, test } from "bun:test"
import { computeDiff } from "@/core/sync/diff"

describe("computeDiff", () => {
  test("同一テキストは in-sync ステータスで差分なし", () => {
    const result = computeDiff(["行A", "行B", "行C"], ["行A", "行B", "行C"])
    expect(result.status).toBe("in-sync")
    expect(result.added).toHaveLength(0)
    expect(result.removed).toHaveLength(0)
    expect(result.modified).toHaveLength(0)
  })

  test("空配列同士は in-sync", () => {
    const result = computeDiff([], [])
    expect(result.status).toBe("in-sync")
  })

  test("ローカルのみ行が増えた場合 added に含まれる", () => {
    const result = computeDiff(["行A", "行B", "行C"], ["行A", "行B"])
    expect(result.status).toBe("modified")
    expect(result.added).toContain("行C")
    expect(result.removed).toHaveLength(0)
  })

  test("ローカルから行が削除された場合 removed に含まれる", () => {
    const result = computeDiff(["行A"], ["行A", "行B", "行C"])
    expect(result.status).toBe("modified")
    expect(result.removed).toContain("行B")
    expect(result.removed).toContain("行C")
    expect(result.added).toHaveLength(0)
  })

  test("行の内容が変わった場合 modified に含まれる", () => {
    const local = ["行A", "変更後", "行C"]
    const remote = ["行A", "変更前", "行C"]
    const result = computeDiff(local, remote)
    expect(result.status).toBe("modified")
    expect(result.modified).toHaveLength(1)
    expect(result.modified[0]).toMatchObject({ before: "変更前", after: "変更後" })
  })

  test("全置換は LCS が空になるため modified に分類される", () => {
    const result = computeDiff(["新行1", "新行2"], ["旧行1", "旧行2"])
    expect(result.status).toBe("modified")
  })

  test("ローカルが空で remote がある場合", () => {
    const result = computeDiff([], ["行A", "行B"])
    expect(result.status).toBe("modified")
    expect(result.removed).toContain("行A")
    expect(result.removed).toContain("行B")
    expect(result.added).toHaveLength(0)
  })

  test("remote が空でローカルがある場合", () => {
    const result = computeDiff(["行A", "行B"], [])
    expect(result.status).toBe("modified")
    expect(result.added).toContain("行A")
    expect(result.added).toContain("行B")
    expect(result.removed).toHaveLength(0)
  })

  test("ローカルに行が挿入された場合 added に含まれる (LCS マッチ中のスキップ)", () => {
    // local に "新行" が追加され、remote にはない
    const local = ["行A", "新行", "行B"]
    const remote = ["行A", "行B"]
    const result = computeDiff(local, remote)
    expect(result.status).toBe("modified")
    expect(result.added).toContain("新行")
    expect(result.removed).toHaveLength(0)
  })

  test("リモートに行が挿入された場合 removed に含まれる (LCS マッチ中のスキップ)", () => {
    // remote に "旧行" があるがローカルにはない
    const local = ["行A", "行B"]
    const remote = ["行A", "旧行", "行B"]
    const result = computeDiff(local, remote)
    expect(result.status).toBe("modified")
    expect(result.removed).toContain("旧行")
    expect(result.added).toHaveLength(0)
  })

  test("LineDiff の line は 1 始まりのラインナンバー", () => {
    const local = ["行A", "変更後", "行C"]
    const remote = ["行A", "変更前", "行C"]
    const result = computeDiff(local, remote)
    // 2行目が変更されている
    expect(result.modified[0]?.line).toBe(2)
  })
})
