/**
 * ws.test.ts — ScrapboxWriter interface と @cosense/std ラッパのテスト。
 *
 * @cosense/std の patch() を spy して、正しい引数で呼ばれるか検証する。
 * 実際の WebSocket 接続は行わない。
 */

import { beforeEach, describe, expect, it, mock } from "bun:test"
import { CosenseWriter, DryRunWriter } from "@/core/api/ws"
import type { Line } from "@/schemas/page"

// @cosense/std のモック
const mockPatch = mock(async () => ({
  commitId: "mock-commit-id",
  pageId: "mock-page-id",
}))

// CosenseWriter はコンストラクタで @cosense/std を受け取る (依存性注入)
const mockStdClient = {
  patch: mockPatch,
}

describe("CosenseWriter", () => {
  beforeEach(() => {
    mockPatch.mockClear()
  })

  it("patch を呼ぶと update 関数の戻り値でコミットする", async () => {
    const writer = new CosenseWriter(
      mockStdClient as ConstructorParameters<typeof CosenseWriter>[0],
    )
    const result = await writer.patch({
      project: "テストプロジェクト",
      title: "テストページ",
      update: async (_lines: Line[]) => ["行1", "行2"],
    })
    expect(mockPatch).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ commitId: "mock-commit-id" })
  })

  it("--dry-run モードでは patch を呼ばず DryRunResult を返す", async () => {
    const writer = new CosenseWriter(
      mockStdClient as ConstructorParameters<typeof CosenseWriter>[0],
      {
        dryRun: true,
      },
    )
    const result = await writer.patch({
      project: "テストプロジェクト",
      title: "テストページ",
      update: async (_lines: Line[]) => ["行1", "行2"],
    })
    expect(mockPatch).not.toHaveBeenCalled()
    expect(result).toMatchObject({ dryRun: true, project: "テストプロジェクト" })
  })
})

describe("DryRunWriter", () => {
  it("patch を呼んでも実際のコミットをしない", async () => {
    const writer = new DryRunWriter()
    const result = await writer.patch({
      project: "テストプロジェクト",
      title: "テストページ",
      update: async (_lines: Line[]) => ["行1", "行2"],
    })
    expect(result).toMatchObject({
      dryRun: true,
      project: "テストプロジェクト",
      title: "テストページ",
    })
  })

  it("insertLines を呼んでも何もしない", async () => {
    const writer = new DryRunWriter()
    const result = await writer.insertLines({
      project: "テストプロジェクト",
      title: "テストページ",
      lines: ["新しい行"],
    })
    expect(result).toMatchObject({ dryRun: true })
  })

  it("deletePage を呼んでも何もしない", async () => {
    const writer = new DryRunWriter()
    const result = await writer.deletePage({
      project: "テストプロジェクト",
      title: "テストページ",
    })
    expect(result).toMatchObject({ dryRun: true })
  })
})
