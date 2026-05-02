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
const mockPin = mock(async () => "ピン留めページ")
const mockUnpin = mock(async () => "ピン解除ページ")

// CosenseWriter はコンストラクタで @cosense/std を受け取る (依存性注入)
const mockStdClient = {
  patch: mockPatch,
  pin: mockPin,
  unpin: mockUnpin,
}

describe("CosenseWriter", () => {
  beforeEach(() => {
    mockPatch.mockClear()
    mockPin.mockClear()
    mockUnpin.mockClear()
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

  it("pinPage を呼ぶと stdClient.pin を正しい引数で呼ぶ", async () => {
    const writer = new CosenseWriter(
      mockStdClient as ConstructorParameters<typeof CosenseWriter>[0],
      { sid: "テスト-sid" },
    )
    await writer.pinPage({ project: "テストプロジェクト", title: "ピンページ", create: true })
    expect(mockPin).toHaveBeenCalledWith("テストプロジェクト", "ピンページ", {
      sid: "テスト-sid",
      create: true,
    })
  })

  it("pinPage の dry-run モードでは stdClient.pin を呼ばず DryRunResult を返す", async () => {
    const writer = new CosenseWriter(
      mockStdClient as ConstructorParameters<typeof CosenseWriter>[0],
      { dryRun: true },
    )
    const result = await writer.pinPage({
      project: "テストプロジェクト",
      title: "ピンページ",
      create: false,
    })
    expect(mockPin).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      dryRun: true,
      project: "テストプロジェクト",
      title: "ピンページ",
    })
  })

  it("unpinPage を呼ぶと stdClient.unpin を正しい引数で呼ぶ", async () => {
    const writer = new CosenseWriter(
      mockStdClient as ConstructorParameters<typeof CosenseWriter>[0],
      { sid: "テスト-sid" },
    )
    await writer.unpinPage({ project: "テストプロジェクト", title: "ピン解除ページ" })
    expect(mockUnpin).toHaveBeenCalledWith("テストプロジェクト", "ピン解除ページ", {
      sid: "テスト-sid",
    })
  })

  it("unpinPage の dry-run モードでは stdClient.unpin を呼ばず DryRunResult を返す", async () => {
    const writer = new CosenseWriter(
      mockStdClient as ConstructorParameters<typeof CosenseWriter>[0],
      { dryRun: true },
    )
    const result = await writer.unpinPage({
      project: "テストプロジェクト",
      title: "ピン解除ページ",
    })
    expect(mockUnpin).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      dryRun: true,
      project: "テストプロジェクト",
      title: "ピン解除ページ",
    })
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

  it("pinPage を呼んでも DryRunResult を返す", async () => {
    const writer = new DryRunWriter()
    const result = await writer.pinPage({
      project: "テストプロジェクト",
      title: "ピンページ",
      create: false,
    })
    expect(result).toMatchObject({
      dryRun: true,
      project: "テストプロジェクト",
      title: "ピンページ",
    })
  })

  it("unpinPage を呼んでも DryRunResult を返す", async () => {
    const writer = new DryRunWriter()
    const result = await writer.unpinPage({
      project: "テストプロジェクト",
      title: "ピン解除ページ",
    })
    expect(result).toMatchObject({
      dryRun: true,
      project: "テストプロジェクト",
      title: "ピン解除ページ",
    })
  })
})
