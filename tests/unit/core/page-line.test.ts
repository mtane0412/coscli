/**
 * page-line.test.ts — getLineRange の単体テスト。
 *
 * REST 経由で指定行範囲のみを取得する純粋読み取り関数の検証。
 * 実際の HTTP 通信は行わない。
 */

import { describe, expect, it, mock } from "bun:test"
import type { CosenseRestClient } from "@/core/api/rest"
import { NotFoundError } from "@/core/api/rest"
import { getLineRange } from "@/core/page-line"

/** getPage モックが返す 5 行のサンプルページ */
const samplePage = {
  id: "page1",
  title: "サンプルページ",
  updated: 1700000000,
  accessed: 1700000001,
  views: 10,
  linked: 2,
  commitId: "abc",
  snapshotCreated: null,
  persistent: true,
  image: null,
  pin: 0,
  pageRank: 0.1,
  descriptions: [],
  lines: [
    { id: "l0", text: "サンプルページ", userId: "u1", created: 0, updated: 0 },
    { id: "l1", text: "本文1行目", userId: "u1", created: 0, updated: 0 },
    { id: "l2", text: "本文2行目", userId: "u1", created: 0, updated: 0 },
    { id: "l3", text: "本文3行目", userId: "u1", created: 0, updated: 0 },
    { id: "l4", text: "本文4行目", userId: "u1", created: 0, updated: 0 },
  ],
  relatedPages: { links1hop: [], links2hop: [], hasBackLinksOrIcons: false },
  collaborators: [],
}

function createMockClient(overrides: Partial<CosenseRestClient> = {}): CosenseRestClient {
  return {
    getPage: mock(async () => samplePage),
    ...overrides,
  } as unknown as CosenseRestClient
}

describe("getLineRange", () => {
  it("--line 2 で 2 行目のみを返す", async () => {
    const client = createMockClient()
    const result = await getLineRange(client, {
      project: "テストプロジェクト",
      title: "サンプルページ",
      start: 2,
      end: 2,
    })
    // 1-indexed の 2 行目 = lines[1]
    expect(result.start).toBe(2)
    expect(result.end).toBe(2)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.text).toBe("本文1行目")
  })

  it("--range 2:4 で 2-4 行目を返す", async () => {
    const client = createMockClient()
    const result = await getLineRange(client, {
      project: "テストプロジェクト",
      title: "サンプルページ",
      start: 2,
      end: 4,
    })
    expect(result.start).toBe(2)
    expect(result.end).toBe(4)
    expect(result.lines).toHaveLength(3)
    expect(result.lines.map((l) => l.text)).toEqual(["本文1行目", "本文2行目", "本文3行目"])
  })

  it("タイトル行 (start=1) を含む範囲も取得できる", async () => {
    const client = createMockClient()
    const result = await getLineRange(client, {
      project: "テストプロジェクト",
      title: "サンプルページ",
      start: 1,
      end: 2,
    })
    expect(result.lines[0]?.text).toBe("サンプルページ")
    expect(result.lines[1]?.text).toBe("本文1行目")
  })

  it("end が行数を超える場合は VALIDATION_ERROR をスローする", async () => {
    const client = createMockClient()
    await expect(
      getLineRange(client, {
        project: "テストプロジェクト",
        title: "サンプルページ",
        start: 2,
        end: 99,
      }),
    ).rejects.toThrow("範囲外")
  })

  it("ページが存在しない場合は NotFoundError をスローする", async () => {
    const client = createMockClient({
      getPage: mock(async () => {
        throw new NotFoundError("ページが見つかりません")
      }),
    })
    await expect(
      getLineRange(client, {
        project: "テストプロジェクト",
        title: "存在しないページ",
        start: 1,
        end: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
