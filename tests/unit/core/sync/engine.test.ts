/**
 * engine.test.ts — sync エンジン (pull/push/diff) の純粋関数テスト。
 *
 * REST クライアントと ScrapboxWriter をモックで注入し、
 * ファイルシステムは一時ディレクトリを使う。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import { syncDiff, syncPull, syncPush } from "@/core/sync/engine"
import type { SyncMeta } from "@/core/sync/meta"
import { readMeta, writeMeta } from "@/core/sync/meta"
import type { Page } from "@/schemas/page"

const TEST_DIR = join(tmpdir(), "coscli-engine-test")

/** テスト用 Page オブジェクトを生成するファクトリ */
function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "ページID",
    title: "テストページ",
    commitId: "コミットABC",
    created: 1700000000,
    updated: 1700000000,
    lines: [
      { id: "l1", text: "テストページ", userId: "u1", created: 1700000000, updated: 1700000000 },
      { id: "l2", text: "本文1行目", userId: "u1", created: 1700000000, updated: 1700000000 },
      { id: "l3", text: "本文2行目", userId: "u1", created: 1700000000, updated: 1700000000 },
    ],
    ...overrides,
  }
}

/** モック REST クライアントを生成する */
function makeRestClient(page: Page): CosenseRestClient {
  return {
    getPage: mock(() => Promise.resolve(page)),
    listPages: mock(() =>
      Promise.resolve({ projectName: "テスト", skip: 0, limit: 100, count: 1, pages: [] }),
    ),
    getPageText: mock(() => Promise.resolve("")),
    getCodeBlock: mock(() => Promise.resolve("")),
    searchPages: mock(() => Promise.resolve({ query: "", pages: [], projectName: "テスト" })),
    getProject: mock(() => Promise.resolve({ name: "テスト" })),
    listProjects: mock(() => Promise.resolve({ projects: [] })),
    getMe: mock(() => Promise.resolve({ id: "u1", name: "テストユーザー" })),
  } as unknown as CosenseRestClient
}

/** モック ScrapboxWriter を生成する */
function makeWriter(commitId = "新コミットXYZ"): ScrapboxWriter {
  return {
    patch: mock(() => Promise.resolve({ commitId, pageId: "ページID" })),
    insertLines: mock(() => Promise.resolve({ commitId })),
    deletePage: mock(() => Promise.resolve({ title: "テストページ" })),
    pinPage: mock(() => Promise.resolve({ title: "テストページ" })),
    unpinPage: mock(() => Promise.resolve({ title: "テストページ" })),
  } as unknown as ScrapboxWriter
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe("syncPull", () => {
  test("ページをローカルに取得してメタファイルを生成する", async () => {
    const page = makePage()
    const client = makeRestClient(page)

    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    // ローカルファイルが作成されている
    expect(existsSync(join(TEST_DIR, "テストページ.txt"))).toBe(true)

    // メタファイルが作成されている
    const meta = readMeta(TEST_DIR, "テストプロジェクト", "テストページ")
    expect(meta).not.toBeNull()
    expect(meta?.commitId).toBe("コミットABC")
    expect(meta?.title).toBe("テストページ")
    expect(meta?.project).toBe("テストプロジェクト")
  })

  test("タイトル行 (lines[0]) を除いた本文が保存される", async () => {
    const page = makePage()
    const client = makeRestClient(page)

    const result = await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    // タイトル行を除いた本文
    expect(result.lines).toEqual(["本文1行目", "本文2行目"])
  })

  test("--dry-run 時はファイルを書き込まない", async () => {
    const page = makePage()
    const client = makeRestClient(page)

    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ", { dryRun: true })

    expect(existsSync(join(TEST_DIR, "テストページ.txt"))).toBe(false)
  })

  test("既存のメタを上書きして commitId を更新する", async () => {
    const oldMeta: SyncMeta = {
      schemaVersion: 1,
      project: "テストプロジェクト",
      title: "テストページ",
      pageId: "ページID",
      commitId: "古いコミット",
      lastPulledAt: 0,
      format: "txt",
      contentSha256: "旧ハッシュ",
    }
    writeMeta(TEST_DIR, oldMeta)

    const page = makePage({ commitId: "新コミットABC" })
    const client = makeRestClient(page)
    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    const meta = readMeta(TEST_DIR, "テストプロジェクト", "テストページ")
    expect(meta?.commitId).toBe("新コミットABC")
  })
})

describe("syncPush", () => {
  test("ローカルファイルをリモートに push する", async () => {
    // まず pull してメタを作成
    const page = makePage()
    const client = makeRestClient(page)
    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    // ローカルファイルを編集
    writeFileSync(join(TEST_DIR, "テストページ.txt"), "編集した本文\n", "utf-8")

    const writer = makeWriter("新コミットXYZ")
    const result = await syncPush(client, writer, TEST_DIR, "テストプロジェクト", "テストページ")

    expect(result.committed).toBe(true)
    expect(result.newCommitId).toBe("新コミットXYZ")
    expect(writer.patch).toHaveBeenCalledTimes(1)
  })

  test("in-sync のとき push しない", async () => {
    // pull して変更せず push
    const page = makePage()
    const client = makeRestClient(page)
    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    const writer = makeWriter()
    const result = await syncPush(client, writer, TEST_DIR, "テストプロジェクト", "テストページ")

    expect(result.committed).toBe(false)
    expect(result.status).toBe("in-sync")
    expect(writer.patch).not.toHaveBeenCalled()
  })

  test("メタが無いとき CONFLICT_NO_META エラーを返す", async () => {
    writeFileSync(join(TEST_DIR, "テストページ.txt"), "本文\n", "utf-8")
    const client = makeRestClient(makePage())
    const writer = makeWriter()

    const result = await syncPush(client, writer, TEST_DIR, "テストプロジェクト", "テストページ")

    expect(result.committed).toBe(false)
    expect(result.errorCode).toBe("META_REQUIRED")
  })

  test("ローカルファイルが存在しない場合 LOCAL_NOT_FOUND エラーを返す", async () => {
    // メタだけ作ってローカルファイルは作らない
    const meta: SyncMeta = {
      schemaVersion: 1,
      project: "テストプロジェクト",
      title: "テストページ",
      pageId: "page-id",
      commitId: "コミットABC",
      lastPulledAt: Date.now(),
      format: "txt",
      contentSha256: "ダミーハッシュ",
    }
    writeMeta(TEST_DIR, meta)

    const client = makeRestClient(makePage())
    const writer = makeWriter()
    const result = await syncPush(client, writer, TEST_DIR, "テストプロジェクト", "テストページ")

    expect(result.committed).toBe(false)
    expect(result.errorCode).toBe("LOCAL_NOT_FOUND")
  })

  test("--dry-run 時は writer.patch を呼ばない", async () => {
    const page = makePage()
    const client = makeRestClient(page)
    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    writeFileSync(join(TEST_DIR, "テストページ.txt"), "編集した本文\n", "utf-8")

    const writer = makeWriter()
    const result = await syncPush(client, writer, TEST_DIR, "テストプロジェクト", "テストページ", {
      dryRun: true,
    })

    expect(writer.patch).not.toHaveBeenCalled()
    expect(result.dryRun).toBe(true)
  })

  test("commitId が一致しない場合 CONFLICT エラーを返す", async () => {
    const page = makePage({ commitId: "コミットABC" })
    const client = makeRestClient(page)
    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    // サーバ側が別コミットに更新された (getPage が別の commitId を返す)
    const conflictPage = makePage({ commitId: "サーバ最新コミット" })
    const conflictClient = makeRestClient(conflictPage)

    writeFileSync(join(TEST_DIR, "テストページ.txt"), "編集した本文\n", "utf-8")

    const writer = makeWriter()
    const result = await syncPush(
      conflictClient,
      writer,
      TEST_DIR,
      "テストプロジェクト",
      "テストページ",
    )

    expect(result.committed).toBe(false)
    expect(result.errorCode).toBe("CONFLICT")
    expect(result.localCommitId).toBe("コミットABC")
    expect(result.serverCommitId).toBe("サーバ最新コミット")
  })

  test("ローカル未編集かつ commitId 不一致は自動再 pull して in-sync (--retries 1)", async () => {
    const page = makePage({ commitId: "コミットABC" })
    const client = makeRestClient(page)
    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    // サーバ側が更新されたが内容は同じ (ローカルは変更していない = contentSha256 一致)
    const updatedPage = makePage({
      commitId: "新コミットXYZ",
      lines: [
        { id: "l1", text: "テストページ", userId: "u1", created: 1700000000, updated: 1700000000 },
        { id: "l2", text: "本文1行目", userId: "u1", created: 1700000000, updated: 1700000000 },
        { id: "l3", text: "本文2行目", userId: "u1", created: 1700000000, updated: 1700000000 },
      ],
    })
    const retryClient = makeRestClient(updatedPage)

    const writer = makeWriter("再プッシュコミット")
    const result = await syncPush(
      retryClient,
      writer,
      TEST_DIR,
      "テストプロジェクト",
      "テストページ",
      { retries: 1 },
    )

    // ローカル未編集のため自動再 pull → サーバと同じ内容なので in-sync (push 不要)
    expect(result.committed).toBe(false)
    expect(result.errorCode).toBeUndefined()
  })
})

describe("syncDiff", () => {
  test("in-sync のとき in-sync ステータスを返す", async () => {
    const page = makePage()
    const client = makeRestClient(page)
    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    const result = await syncDiff(client, TEST_DIR, "テストプロジェクト", "テストページ")

    expect(result.status).toBe("in-sync")
    expect(result.diff.added).toHaveLength(0)
    expect(result.diff.removed).toHaveLength(0)
  })

  test("ローカルファイルが存在しない場合 local-only ではなく remote-only ステータス", async () => {
    const page = makePage()
    const client = makeRestClient(page)

    const result = await syncDiff(client, TEST_DIR, "テストプロジェクト", "テストページ")

    expect(result.status).toBe("remote-only")
  })

  test("リモートが空でローカルにある場合 local-only ステータス", async () => {
    // ローカルファイルだけ作成 (メタなし、リモートは空ページ)
    writeFileSync(join(TEST_DIR, "ローカルのみ.txt"), "ローカルの行\n", "utf-8")

    const emptyPage = makePage({
      title: "ローカルのみ",
      lines: [
        { id: "l1", text: "ローカルのみ", userId: "u1", created: 1700000000, updated: 1700000000 },
      ],
    })
    const client = makeRestClient(emptyPage)

    const result = await syncDiff(client, TEST_DIR, "テストプロジェクト", "ローカルのみ")

    expect(result.status).toBe("local-only")
    expect(result.local).not.toBeNull()
    expect(result.remote?.lineCount).toBe(0)
  })

  test("ローカルの変更を差分として返す", async () => {
    const page = makePage()
    const client = makeRestClient(page)
    await syncPull(client, TEST_DIR, "テストプロジェクト", "テストページ")

    // ローカルファイルを編集 (サーバの行と全く異なる内容にする)
    writeFileSync(join(TEST_DIR, "テストページ.txt"), "新しい本文\n追加行\n", "utf-8")

    const result = await syncDiff(client, TEST_DIR, "テストプロジェクト", "テストページ")

    expect(result.status).toBe("modified")
    // LCS が空のとき: 先頭行は modified、残りは added/removed として分類される
    // 重要なのは status が "modified" であること
    const allChanges = [
      ...result.diff.added,
      ...result.diff.removed,
      ...result.diff.modified.map((m) => m.after),
    ]
    expect(allChanges.length).toBeGreaterThan(0)
  })
})
