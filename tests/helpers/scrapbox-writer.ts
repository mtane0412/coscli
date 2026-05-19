/**
 * scrapbox-writer.ts — ScrapboxWriter テストモック生成ヘルパー。
 *
 * 全メソッドが bun:test の mock() でラップされており、呼び出し引数と回数を検証できる。
 */

import { mock } from "bun:test"
import type { ScrapboxWriter } from "@/core/api/ws"

/**
 * createTestWriter は ScrapboxWriter のモック実装を生成する。
 *
 * overrides で個別メソッドを差し替えられる。差し替えたメソッド以外はデフォルト実装が使われる。
 */
export function createTestWriter(overrides?: Partial<ScrapboxWriter>): ScrapboxWriter {
  return {
    patch: mock(async () => ({ commitId: "commitId1", pageId: "pageId1" })),
    insertLines: mock(async () => ({ commitId: "commitId1" })),
    deletePage: mock(async () => ({ title: "テストページ" })),
    pinPage: mock(async () => ({ title: "テストページ" })),
    unpinPage: mock(async () => ({ title: "テストページ" })),
    ...overrides,
  } as unknown as ScrapboxWriter
}
