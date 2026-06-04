/**
 * edit-ops.test.ts — ユーザー向け ops を API の changes フォーマットに変換する関数のテスト。
 */

import { describe, expect, it } from "bun:test"
import { translateOps } from "@/core/edit-ops"

/** テスト用に固定の行 ID を生成するジェネレータ。 */
function makeIdGen(prefix = "testid"): () => string {
  let count = 0
  return () => `${prefix}${String(++count).padStart(3, "0")}`
}

describe("translateOps", () => {
  describe("insertBefore op", () => {
    it("insertBefore op を _insert change に変換する", () => {
      const gen = makeIdGen()
      const result = translateOps([{ insertBefore: "既存行abc", text: "新しいテキスト" }], gen)

      expect(result.changes).toHaveLength(1)
      expect(result.changes[0]).toEqual({
        _insert: "既存行abc",
        lines: { id: "testid001", text: "新しいテキスト" },
      })
      expect(result.newLineIds.has("testid001")).toBe(true)
      expect(result.updatedLineIds.size).toBe(0)
    })

    it("_end アンカーへの insertBefore を受け入れる", () => {
      const gen = makeIdGen()
      const result = translateOps([{ insertBefore: "_end", text: "末尾追加テキスト" }], gen)

      expect(result.changes[0]).toMatchObject({ _insert: "_end" })
    })

    it("insertBefore の複数行テキスト（\\n 区切り）を複数の _insert change に変換する", () => {
      const gen = makeIdGen()
      const result = translateOps([{ insertBefore: "_end", text: "1行目\n2行目\n3行目" }], gen)

      expect(result.changes).toHaveLength(3)
      expect(result.changes[0]).toEqual({
        _insert: "_end",
        lines: { id: "testid001", text: "1行目" },
      })
      expect(result.changes[1]).toEqual({
        _insert: "_end",
        lines: { id: "testid002", text: "2行目" },
      })
      expect(result.changes[2]).toEqual({
        _insert: "_end",
        lines: { id: "testid003", text: "3行目" },
      })
      expect(result.newLineIds.size).toBe(3)
    })

    it("insertBefore の CRLF 改行も複数行に分割する", () => {
      const gen = makeIdGen()
      const result = translateOps([{ insertBefore: "_end", text: "行A\r\n行B" }], gen)

      expect(result.changes).toHaveLength(2)
      // _insert change は lines フィールドを持つ
      const c0 = result.changes[0] as { _insert: string; lines: { id: string; text: string } }
      const c1 = result.changes[1] as { _insert: string; lines: { id: string; text: string } }
      expect(c0.lines.text).toBe("行A")
      expect(c1.lines.text).toBe("行B")
    })
  })

  describe("replace op", () => {
    it("replace op を _update change に変換する", () => {
      const gen = makeIdGen()
      const result = translateOps([{ replace: "行ID-xyz", text: "更新テキスト" }], gen)

      expect(result.changes).toHaveLength(1)
      expect(result.changes[0]).toEqual({
        _update: "行ID-xyz",
        lines: { text: "更新テキスト" },
      })
      expect(result.updatedLineIds.has("行ID-xyz")).toBe(true)
      expect(result.newLineIds.size).toBe(0)
    })

    it("replace の複数行テキストはエラーをスローする", () => {
      const gen = makeIdGen()
      expect(() => translateOps([{ replace: "行ID-xyz", text: "行1\n行2" }], gen)).toThrow(
        /replace.*複数行/,
      )
    })

    it("replace の CRLF 改行もエラーをスローする", () => {
      const gen = makeIdGen()
      expect(() => translateOps([{ replace: "行ID-xyz", text: "行1\r\n行2" }], gen)).toThrow()
    })
  })

  describe("delete op", () => {
    it("delete op を _delete change に変換する", () => {
      const gen = makeIdGen()
      const result = translateOps([{ delete: "削除対象行ID" }], gen)

      expect(result.changes).toHaveLength(1)
      expect(result.changes[0]).toEqual({ _delete: "削除対象行ID" })
      expect(result.newLineIds.size).toBe(0)
      expect(result.updatedLineIds.size).toBe(0)
    })
  })

  describe("複合 ops", () => {
    it("insertBefore・replace・delete が混在する場合に正しく変換する", () => {
      const gen = makeIdGen()
      const result = translateOps(
        [
          { insertBefore: "行001", text: "挿入テキスト" },
          { replace: "行002", text: "置換テキスト" },
          { delete: "行003" },
        ],
        gen,
      )

      expect(result.changes).toHaveLength(3)
      expect(result.changes[0]).toMatchObject({ _insert: "行001" })
      expect(result.changes[1]).toMatchObject({ _update: "行002" })
      expect(result.changes[2]).toMatchObject({ _delete: "行003" })
    })

    it("空の ops 配列を受け入れる", () => {
      const gen = makeIdGen()
      const result = translateOps([], gen)

      expect(result.changes).toHaveLength(0)
      expect(result.newLineIds.size).toBe(0)
      expect(result.updatedLineIds.size).toBe(0)
    })
  })

  describe("バリデーション", () => {
    it("ops が配列でない場合はエラーをスローする", () => {
      const gen = makeIdGen()
      expect(() => translateOps("配列ではない", gen)).toThrow(/ops.*配列/)
    })

    it("null の ops はエラーをスローする", () => {
      const gen = makeIdGen()
      expect(() => translateOps(null, gen)).toThrow()
    })

    it("不正なキーを持つ op はエラーをスローする", () => {
      const gen = makeIdGen()
      expect(() => translateOps([{ unknownOp: "行ID" }], gen)).toThrow()
    })

    it("複数のキーを持つ op はエラーをスローする", () => {
      const gen = makeIdGen()
      expect(() =>
        translateOps([{ insertBefore: "行ID", replace: "行ID", text: "テキスト" }], gen),
      ).toThrow()
    })
  })
})
