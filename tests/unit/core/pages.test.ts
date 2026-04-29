/**
 * pages.test.ts — core/pages ユースケース層の単体テスト。
 *
 * CosenseRestClient をモックに差し替えてユースケース関数を検証する。
 * 実際の HTTP 通信は行わない。
 */

import { describe, expect, it, mock } from "bun:test"
import type { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import {
  appendToPage,
  createPage,
  deletePage,
  editPage,
  getCodeBlock,
  getPage,
  getPageText,
  listPages,
} from "@/core/pages"

/** REST クライアントのモック */
function createMockRestClient(overrides: Partial<CosenseRestClient> = {}): CosenseRestClient {
  return {
    getMe: mock(async () => ({ id: "user1", name: "テストユーザー", csrfToken: "csrf-token" })),
    listPages: mock(async () => ({
      projectName: "テストプロジェクト",
      skip: 0,
      limit: 30,
      count: 1,
      pages: [
        {
          id: "page1",
          title: "テストページ",
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
          descriptions: ["概要行"],
        },
      ],
    })),
    getPage: mock(async () => ({
      id: "page1",
      title: "テストページ",
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
      descriptions: ["概要行"],
      lines: [{ id: "l1", text: "テストページ", userId: "u1", created: 0, updated: 0 }],
      relatedPages: { links1hop: [], links2hop: [], hasBackLinksOrIcons: false },
      collaborators: [],
    })),
    getPageText: mock(async () => "テストページ\n本文テキスト"),
    getCodeBlock: mock(async () => 'console.log("hello")'),
    searchPages: mock(async () => ({
      projectName: "テストプロジェクト",
      query: "テスト",
      limit: 10,
      count: 1,
      existsExactTitleMatch: false,
      pages: [],
    })),
    getProject: mock(async () => ({
      id: "proj1",
      name: "テストプロジェクト",
      displayName: "テストプロジェクト",
      publicVisible: true,
      loginStrategies: [],
      theme: "default",
      gyazoTeamsName: null,
      translation: false,
      infobox: false,
      created: 1700000000,
      updated: 1700000000,
      isMember: true,
    })),
    listProjects: mock(async () => ({ projects: [] })),
    ...overrides,
  } as unknown as CosenseRestClient
}

/** Writer のモック */
function createMockWriter(overrides: Partial<ScrapboxWriter> = {}): ScrapboxWriter {
  return {
    patch: mock(async () => ({ commitId: "commit1", pageId: "page1" })),
    insertLines: mock(async () => ({ commitId: "commit1" })),
    deletePage: mock(async () => ({ title: "テストページ" })),
    ...overrides,
  } as unknown as ScrapboxWriter
}

describe("listPages", () => {
  it("REST クライアントから pages リストを取得して返す", async () => {
    const client = createMockRestClient()
    const result = await listPages(client, { project: "テストプロジェクト" })
    expect(client.listPages).toHaveBeenCalledWith("テストプロジェクト", {})
    expect(result.pages[0]?.title).toBe("テストページ")
  })

  it("limit と sort オプションを REST クライアントに渡す", async () => {
    const client = createMockRestClient()
    await listPages(client, { project: "proj", limit: 5, sort: "updated" })
    expect(client.listPages).toHaveBeenCalledWith("proj", { limit: 5, sort: "updated" })
  })
})

describe("getPage", () => {
  it("タイトルを指定してページを取得する", async () => {
    const client = createMockRestClient()
    const result = await getPage(client, { project: "proj", title: "テストページ" })
    expect(client.getPage).toHaveBeenCalledWith("proj", "テストページ")
    expect(result.title).toBe("テストページ")
  })
})

describe("createPage", () => {
  it("Writer の patch を呼んでページを作成する", async () => {
    const writer = createMockWriter()
    const result = await createPage(writer, {
      project: "proj",
      title: "新しいページ",
      lines: ["行1", "行2"],
    })
    expect(writer.patch).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ commitId: "commit1" })
  })
})

describe("appendToPage", () => {
  it("Writer の insertLines を呼んで行を追加する", async () => {
    const writer = createMockWriter()
    await appendToPage(writer, {
      project: "proj",
      title: "既存ページ",
      lines: ["追加行"],
    })
    expect(writer.insertLines).toHaveBeenCalledWith({
      project: "proj",
      title: "既存ページ",
      lines: ["追加行"],
    })
  })
})

describe("getPageText", () => {
  it("ページのテキスト本文を取得する", async () => {
    const client = createMockRestClient()
    const result = await getPageText(client, { project: "proj", title: "テストページ" })
    expect(client.getPageText).toHaveBeenCalledWith("proj", "テストページ")
    expect(result).toContain("テストページ")
  })
})

describe("getCodeBlock", () => {
  it("コードブロックを取得する", async () => {
    const client = createMockRestClient()
    const result = await getCodeBlock(client, {
      project: "proj",
      title: "テストページ",
      filename: "main.ts",
    })
    expect(client.getCodeBlock).toHaveBeenCalledWith("proj", "テストページ", "main.ts")
    expect(result).toContain("hello")
  })
})

describe("editPage", () => {
  it("Writer の patch を呼んでページを全置換する", async () => {
    const writer = createMockWriter()
    await editPage(writer, { project: "proj", title: "既存ページ", lines: ["新しい内容"] })
    expect(writer.patch).toHaveBeenCalledTimes(1)
  })
})

describe("deletePage", () => {
  it("Writer の deletePage を呼んでページを削除する", async () => {
    const writer = createMockWriter()
    await deletePage(writer, { project: "proj", title: "削除ページ" })
    expect(writer.deletePage).toHaveBeenCalledWith({ project: "proj", title: "削除ページ" })
  })
})
