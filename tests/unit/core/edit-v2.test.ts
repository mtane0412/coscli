/**
 * edit-v2.test.ts — v2 AI ops 向けの change 構築ヘルパー関数のテスト。
 *
 * buildAppendChanges / buildPrependChanges / buildInsertChanges /
 * buildReplaceChanges / buildDeleteChanges / buildNewPageChanges /
 * buildPreviewResult の各関数を検証する。
 */

import { describe, expect, it } from "bun:test"
import {
  buildAppendChanges,
  buildDeleteChanges,
  buildInsertChanges,
  buildNewPageChanges,
  buildPrependChanges,
  buildPreviewResult,
  buildReplaceChanges,
} from "@/core/edit-v2"
import type { PagePreview } from "@/schemas/edit-v2"

/** テスト用に固定の行 ID を生成するジェネレータ。 */
function makeIdGen(prefix = "testid"): () => string {
  let count = 0
  return () => `${prefix}${String(++count).padStart(3, "0")}`
}

describe("buildAppendChanges", () => {
  it("1 行のテキストを _insert: '_end' change に変換する", () => {
    const gen = makeIdGen()
    const result = buildAppendChanges(["末尾に追加する行"], gen)

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toEqual({
      _insert: "_end",
      lines: { id: "testid001", text: "末尾に追加する行" },
    })
    expect(result.newLineIds.has("testid001")).toBe(true)
    expect(result.updatedLineIds.size).toBe(0)
  })

  it("複数行を複数の _insert: '_end' change に変換する", () => {
    const gen = makeIdGen()
    const result = buildAppendChanges(["1行目", "2行目", "3行目"], gen)

    expect(result.changes).toHaveLength(3)
    expect(result.changes[0]).toMatchObject({ _insert: "_end", lines: { text: "1行目" } })
    expect(result.changes[1]).toMatchObject({ _insert: "_end", lines: { text: "2行目" } })
    expect(result.changes[2]).toMatchObject({ _insert: "_end", lines: { text: "3行目" } })
    expect(result.newLineIds.size).toBe(3)
  })

  it("空の配列を渡すと changes が空になる", () => {
    const gen = makeIdGen()
    const result = buildAppendChanges([], gen)

    expect(result.changes).toHaveLength(0)
    expect(result.newLineIds.size).toBe(0)
  })
})

describe("buildPrependChanges", () => {
  it("指定アンカー行 ID の直前に挿入する _insert change を生成する", () => {
    const gen = makeIdGen()
    const result = buildPrependChanges("2行目のlineId", ["先頭に挿入する行"], gen)

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toEqual({
      _insert: "2行目のlineId",
      lines: { id: "testid001", text: "先頭に挿入する行" },
    })
    expect(result.newLineIds.has("testid001")).toBe(true)
  })

  it("_end アンカーを使うと末尾に挿入される", () => {
    const gen = makeIdGen()
    const result = buildPrependChanges("_end", ["タイトル行のみのページへの挿入"], gen)

    expect(result.changes[0]).toMatchObject({ _insert: "_end" })
  })

  it("複数行を同一アンカーに挿入する", () => {
    const gen = makeIdGen()
    const result = buildPrependChanges("2行目のlineId", ["挿入行A", "挿入行B"], gen)

    expect(result.changes).toHaveLength(2)
    expect(result.changes[0]).toMatchObject({
      _insert: "2行目のlineId",
      lines: { text: "挿入行A" },
    })
    expect(result.changes[1]).toMatchObject({
      _insert: "2行目のlineId",
      lines: { text: "挿入行B" },
    })
  })
})

describe("buildInsertChanges", () => {
  it("指定アンカー行 ID の直前に行を挿入する _insert change を生成する", () => {
    const gen = makeIdGen()
    const result = buildInsertChanges("次行のlineId", ["挿入する行"], gen)

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toMatchObject({
      _insert: "次行のlineId",
      lines: { text: "挿入する行" },
    })
    expect(result.newLineIds.size).toBe(1)
  })

  it("最終行への挿入は _end を使う", () => {
    const gen = makeIdGen()
    const result = buildInsertChanges("_end", ["最終行への挿入"], gen)

    expect(result.changes[0]).toMatchObject({ _insert: "_end" })
  })

  it("複数行を同一アンカーに挿入する", () => {
    const gen = makeIdGen()
    const result = buildInsertChanges("次行のlineId", ["挿入1", "挿入2"], gen)

    expect(result.changes).toHaveLength(2)
    expect(result.changes[0]).toMatchObject({ _insert: "次行のlineId", lines: { text: "挿入1" } })
    expect(result.changes[1]).toMatchObject({ _insert: "次行のlineId", lines: { text: "挿入2" } })
  })
})

describe("buildReplaceChanges", () => {
  it("指定 lineId のテキストを置換する _update change を生成する", () => {
    const result = buildReplaceChanges("既存行のlineId", "置換後のテキスト")

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toEqual({
      _update: "既存行のlineId",
      lines: { text: "置換後のテキスト" },
    })
    expect(result.updatedLineIds.has("既存行のlineId")).toBe(true)
    expect(result.newLineIds.size).toBe(0)
  })

  it("改行を含むテキストを渡すとエラーをスローする（API 制約）", () => {
    expect(() => buildReplaceChanges("行のlineId", "行1\n行2")).toThrow(/replace.*複数行/)
  })

  it("CRLF 改行もエラーをスローする", () => {
    expect(() => buildReplaceChanges("行のlineId", "行1\r\n行2")).toThrow()
  })

  it("空文字のテキストは許容する", () => {
    const result = buildReplaceChanges("行のlineId", "")

    expect(result.changes[0]).toEqual({ _update: "行のlineId", lines: { text: "" } })
  })
})

describe("buildDeleteChanges", () => {
  it("指定 lineId の行を削除する _delete change を生成する", () => {
    const result = buildDeleteChanges(["削除対象行のlineId"])

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toEqual({ _delete: "削除対象行のlineId" })
    expect(result.newLineIds.size).toBe(0)
    expect(result.updatedLineIds.size).toBe(0)
  })

  it("複数の lineId を渡すと複数の _delete change を生成する", () => {
    const result = buildDeleteChanges(["行001", "行002", "行003"])

    expect(result.changes).toHaveLength(3)
    expect(result.changes[0]).toEqual({ _delete: "行001" })
    expect(result.changes[1]).toEqual({ _delete: "行002" })
    expect(result.changes[2]).toEqual({ _delete: "行003" })
  })

  it("空配列を渡すと changes が空になる", () => {
    const result = buildDeleteChanges([])

    expect(result.changes).toHaveLength(0)
  })
})

describe("buildNewPageChanges", () => {
  it("タイトルと本文から新規ページ作成用の _insert: '_end' change を生成する", () => {
    const gen = makeIdGen()
    const result = buildNewPageChanges("新しいページ", ["本文1行目", "本文2行目"], gen)

    // タイトル + 本文2行 = 3行分の _insert change
    expect(result.changes).toHaveLength(3)
    expect(result.changes[0]).toMatchObject({ _insert: "_end", lines: { text: "新しいページ" } })
    expect(result.changes[1]).toMatchObject({ _insert: "_end", lines: { text: "本文1行目" } })
    expect(result.changes[2]).toMatchObject({ _insert: "_end", lines: { text: "本文2行目" } })
    expect(result.newLineIds.size).toBe(3)
  })

  it("本文なし（タイトルのみ）のページを作成できる", () => {
    const gen = makeIdGen()
    const result = buildNewPageChanges("タイトルのみのページ", [], gen)

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toMatchObject({
      _insert: "_end",
      lines: { text: "タイトルのみのページ" },
    })
  })
})

describe("buildPreviewResult", () => {
  const samplePagePreview: PagePreview = {
    title: "テストページ",
    persistent: true,
    lines: [
      { id: "行001", text: "テストページ" },
      { id: "行002", text: "既存の行" },
      { id: "新行001", text: "挿入された行" },
    ],
  }

  it("previewId・expireAt・status・title・lines を含む結果を組み立てる", () => {
    const result = buildPreviewResult(
      "プレビューID-abc",
      "2026-06-05T12:00:00.000Z",
      "update",
      "テストページ",
      samplePagePreview,
      [],
    )

    expect(result.previewId).toBe("プレビューID-abc")
    expect(result.expireAt).toBe("2026-06-05T12:00:00.000Z")
    expect(result.status).toBe("update")
    expect(result.title).toBe("テストページ")
    expect(result.lines).toHaveLength(3)
  })

  it("新規行の ID が newLineIds に含まれる場合は marker: 'new' を付与する", () => {
    const newLineIds = new Set(["新行001"])
    const updatedLineIds = new Set<string>()

    const result = buildPreviewResult(
      "プレビューID",
      "2026-06-05T12:00:00.000Z",
      "create",
      "テストページ",
      samplePagePreview,
      [newLineIds, updatedLineIds],
    )

    const newLine = result.lines.find((l) => l.id === "新行001")
    const existingLine = result.lines.find((l) => l.id === "行002")
    expect(newLine?.marker).toBe("new")
    expect(existingLine?.marker).toBeNull()
  })

  it("更新行の ID が updatedLineIds に含まれる場合は marker: 'updated' を付与する", () => {
    const newLineIds = new Set<string>()
    const updatedLineIds = new Set(["行002"])

    const result = buildPreviewResult(
      "プレビューID",
      "2026-06-05T12:00:00.000Z",
      "update",
      "テストページ",
      samplePagePreview,
      [newLineIds, updatedLineIds],
    )

    const updatedLine = result.lines.find((l) => l.id === "行002")
    expect(updatedLine?.marker).toBe("updated")
  })

  it("pagePreview が null の場合は lines が空配列になる", () => {
    const result = buildPreviewResult(
      "プレビューID",
      "2026-06-05T12:00:00.000Z",
      "create",
      "新しいページ",
      null,
      [],
    )

    expect(result.lines).toHaveLength(0)
  })

  it("status: 'create' が正しく設定される", () => {
    const result = buildPreviewResult(
      "プレビューID",
      "2026-06-05T12:00:00.000Z",
      "create",
      "新規ページ",
      samplePagePreview,
      [],
    )

    expect(result.status).toBe("create")
  })
})
