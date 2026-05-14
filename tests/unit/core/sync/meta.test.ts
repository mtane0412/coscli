/**
 * meta.test.ts — SyncMeta スキーマと read/write のテスト。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type SyncMeta, SyncMetaSchema, readMeta, writeMeta } from "@/core/sync/meta"

const TEST_DIR = join(tmpdir(), "coscli-meta-test")

function makeValidMeta(overrides: Partial<SyncMeta> = {}): SyncMeta {
  return {
    schemaVersion: 1,
    project: "テストプロジェクト",
    title: "テストページ",
    pageId: "page-id-123",
    commitId: "commit-abc",
    lastPulledAt: 1700000000000,
    format: "txt",
    contentSha256: "abcdef1234567890",
    ...overrides,
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe("SyncMetaSchema", () => {
  test("有効なメタデータはパースできる", () => {
    const meta = makeValidMeta()
    const parsed = SyncMetaSchema.safeParse(meta)
    expect(parsed.success).toBe(true)
  })

  test("schemaVersion が 1 でなければ失敗する", () => {
    const parsed = SyncMetaSchema.safeParse(makeValidMeta({ schemaVersion: 2 as 1 }))
    expect(parsed.success).toBe(false)
  })

  test("commitId がなければ失敗する", () => {
    const { commitId: _, ...rest } = makeValidMeta()
    const parsed = SyncMetaSchema.safeParse(rest)
    expect(parsed.success).toBe(false)
  })
})

describe("writeMeta / readMeta", () => {
  test("writeMeta でメタファイルを書き込める", () => {
    const meta = makeValidMeta()
    writeMeta(TEST_DIR, meta)

    const metaPath = join(TEST_DIR, ".coscli", "テストプロジェクト", "テストページ.json")
    expect(existsSync(metaPath)).toBe(true)
  })

  test("writeMeta は中間ディレクトリを自動作成する", () => {
    const meta = makeValidMeta({ project: "新プロジェクト", title: "新ページ" })
    writeMeta(TEST_DIR, meta)

    const metaPath = join(TEST_DIR, ".coscli", "新プロジェクト", "新ページ.json")
    expect(existsSync(metaPath)).toBe(true)
  })

  test("readMeta で書き込んだメタデータを読み込める", () => {
    const meta = makeValidMeta()
    writeMeta(TEST_DIR, meta)
    const loaded = readMeta(TEST_DIR, "テストプロジェクト", "テストページ")

    expect(loaded).not.toBeNull()
    expect(loaded?.commitId).toBe("commit-abc")
    expect(loaded?.title).toBe("テストページ")
  })

  test("readMeta はファイルが存在しない場合 null を返す", () => {
    const result = readMeta(TEST_DIR, "存在しないプロジェクト", "存在しないページ")
    expect(result).toBeNull()
  })

  test("writeMeta で書き込まれたファイルのパーミッションが 0o600 であること", () => {
    const meta = makeValidMeta()
    writeMeta(TEST_DIR, meta)

    const metaPath = join(TEST_DIR, ".coscli", "テストプロジェクト", "テストページ.json")
    const stat = statSync(metaPath)
    // 下位 9 ビットでファイルパーミッションを確認する
    const mode = stat.mode & 0o777
    expect(mode).toBe(0o600)
  })

  test("metaPath はタイトルをファイル名に使う", () => {
    const meta = makeValidMeta({ title: "通常タイトル" })
    writeMeta(TEST_DIR, meta)

    const raw = readFileSync(
      join(TEST_DIR, ".coscli", "テストプロジェクト", "通常タイトル.json"),
      "utf-8",
    )
    const parsed = JSON.parse(raw) as SyncMeta
    expect(parsed.title).toBe("通常タイトル")
  })
})
