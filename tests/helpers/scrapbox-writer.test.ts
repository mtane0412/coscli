/**
 * scrapbox-writer.test.ts — createTestWriter ヘルパーのテスト。
 *
 * ScrapboxWriter モック生成ヘルパーが正しく動作することを検証する。
 */

import { describe, expect, it, mock } from "bun:test"
import type { ScrapboxWriter } from "@/core/api/ws"
import { createTestWriter } from "./scrapbox-writer"

describe("createTestWriter", () => {
  it("ScrapboxWriter インターフェースの全メソッドを持つオブジェクトを返す", () => {
    const writer = createTestWriter()
    expect(typeof writer.patch).toBe("function")
    expect(typeof writer.insertLines).toBe("function")
    expect(typeof writer.deletePage).toBe("function")
    expect(typeof writer.pinPage).toBe("function")
    expect(typeof writer.unpinPage).toBe("function")
  })

  it("patch のデフォルト戻り値は commitId と pageId を持つ", async () => {
    const writer = createTestWriter()
    const result = await writer.patch({
      project: "テストプロジェクト",
      title: "テストページ",
      update: async (lines) => lines.map((l) => l.text),
    })
    expect(result).toHaveProperty("commitId")
    expect(result).toHaveProperty("pageId")
  })

  it("overrides で特定メソッドの戻り値を差し替えられる", async () => {
    const dryRunResult = {
      dryRun: true as const,
      project: "上書きプロジェクト",
      title: "上書きページ",
    }
    const writer = createTestWriter({
      patch: mock(async () => dryRunResult),
    })
    const result = await writer.patch({
      project: "上書きプロジェクト",
      title: "上書きページ",
      update: async (lines) => lines.map((l) => l.text),
    })
    expect(result).toEqual(dryRunResult)
  })

  it("各メソッドはスパイとして呼び出し回数と引数を記録できる", async () => {
    const writer = createTestWriter()
    await writer.deletePage({ project: "テストプロジェクト", title: "削除対象ページ" })
    expect(writer.deletePage).toHaveBeenCalledTimes(1)
    expect(writer.deletePage).toHaveBeenCalledWith({
      project: "テストプロジェクト",
      title: "削除対象ページ",
    })
  })

  it("overrides で ScrapboxWriter を受け取る関数に渡せる型互換性がある", () => {
    // 型レベルのチェック: createTestWriter の戻り値が ScrapboxWriter に代入できる
    const writer: ScrapboxWriter = createTestWriter()
    expect(writer).toBeDefined()
  })
})
