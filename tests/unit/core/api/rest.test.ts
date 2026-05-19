/**
 * rest.test.ts — Cosense REST API クライアントのテスト。
 *
 * msw でモックサーバーを立て、REST クライアントの動作を検証する。
 */

import { describe, expect, it } from "bun:test"
import { CosenseApiError, CosenseRestClient, NotFoundError } from "@/core/api/rest"
import { http, HttpResponse } from "msw"
import { useMswServer } from "../../../helpers/msw"

import meFixture from "../../../fixtures/me.json"
import pageDetailFixture from "../../../fixtures/page-detail.json"
import pageListFixture from "../../../fixtures/page-list.json"
import searchTitlesPage2Fixture from "../../../fixtures/search-titles-page2.json"
import searchTitlesFixture from "../../../fixtures/search-titles.json"
import pageSnapshotResultFixture from "../../../fixtures/snapshots/page-snapshot-result.json"
import pageSnapshotsListFixture from "../../../fixtures/snapshots/page-snapshots-list.json"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
const TEST_SID = "s%3Atest-connect-sid"

const server = useMswServer([
  http.get(`${BASE_URL}/api/users/me`, ({ request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    return HttpResponse.json(meFixture)
  }),

  http.get(`${BASE_URL}/api/pages/:project`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (params["project"] === TEST_PROJECT) {
      return HttpResponse.json(pageListFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (
      params["project"] === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === "Hello_World"
    ) {
      return HttpResponse.json(pageDetailFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  http.get(`${BASE_URL}/api/pages/:project/:title/text`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return new HttpResponse("Unauthorized", { status: 401 })
    }
    if (
      params["project"] === TEST_PROJECT &&
      decodeURIComponent(params["title"] as string) === "Hello_World"
    ) {
      return new HttpResponse("Hello World\n最初の行\n2行目")
    }
    return new HttpResponse("Not found", { status: 404 })
  }),

  // Smart Context: 1hop リンクエクスポート
  http.get(`${BASE_URL}/api/smart-context/export-1hop-links/:project`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return new HttpResponse("Unauthorized", { status: 401 })
    }
    const projectParam = decodeURIComponent(params["project"] as string)
    const project = projectParam.endsWith(".txt") ? projectParam.slice(0, -4) : projectParam
    const url = new URL(request.url)
    const title = url.searchParams.get("title")
    if (project === TEST_PROJECT && title === "テストページ") {
      return new HttpResponse("1hop Smart Context テキスト")
    }
    return new HttpResponse("Not found", { status: 404 })
  }),

  // Smart Context: 2hop リンクエクスポート
  http.get(`${BASE_URL}/api/smart-context/export-2hop-links/:project`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return new HttpResponse("Unauthorized", { status: 401 })
    }
    const projectParam = decodeURIComponent(params["project"] as string)
    const project = projectParam.endsWith(".txt") ? projectParam.slice(0, -4) : projectParam
    const url = new URL(request.url)
    const title = url.searchParams.get("title")
    if (project === TEST_PROJECT && title === "テストページ") {
      return new HttpResponse("2hop Smart Context テキスト")
    }
    return new HttpResponse("Not found", { status: 404 })
  }),

  http.get(`${BASE_URL}/api/pages/:project/search/query`, ({ request, params }) => {
    if (params["project"] === TEST_PROJECT) {
      const url = new URL(request.url)
      const query = url.searchParams.get("q")
      return HttpResponse.json({
        projectName: TEST_PROJECT,
        pages:
          query === "Hello"
            ? [{ id: "page-id-hello", title: "Hello World", words: ["Hello"] }]
            : [],
      })
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  http.get(`${BASE_URL}/api/page-snapshots/:project/:pageId`, ({ params, request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (params["project"] === TEST_PROJECT && params["pageId"] === "page-id-hello") {
      return HttpResponse.json(pageSnapshotsListFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  http.get(
    `${BASE_URL}/api/page-snapshots/:project/:pageId/:timestampId`,
    ({ params, request }) => {
      const cookie = request.headers.get("Cookie")
      if (!cookie?.includes("connect.sid")) {
        return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
      }
      if (
        params["project"] === TEST_PROJECT &&
        params["pageId"] === "page-id-hello" &&
        params["timestampId"] === "1700000000-snap2"
      ) {
        return HttpResponse.json(pageSnapshotResultFixture)
      }
      return HttpResponse.json({ message: "Not found" }, { status: 404 })
    },
  ),

  http.get(`${BASE_URL}/api/projects/search/query`, ({ request }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    const url = new URL(request.url)
    const query = url.searchParams.get("q")
    return HttpResponse.json({
      searchQuery: query ?? "",
      query: { words: query ? [query] : [], excludes: [] },
      projects:
        query === "hello"
          ? [
              { _id: "project-id-my", name: "myproject", displayName: "マイプロジェクト" },
              { _id: "project-id-help", name: "helpproject", displayName: "ヘルプ" },
            ]
          : [],
    })
  }),

  http.get(`${BASE_URL}/api/pages/:project/search/titles`, ({ request, params }) => {
    const cookie = request.headers.get("Cookie")
    if (!cookie?.includes("connect.sid")) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (params["project"] !== TEST_PROJECT) {
      return HttpResponse.json({ message: "Not found" }, { status: 404 })
    }
    const url = new URL(request.url)
    const followingId = url.searchParams.get("followingId")
    // 1ページ目: X-following-id ヘッダ付きで返す
    if (!followingId) {
      return HttpResponse.json(searchTitlesFixture, {
        headers: { "X-following-id": "page2-following-id" },
      })
    }
    // 2ページ目: ヘッダなし (最終ページ)
    if (followingId === "page2-following-id") {
      return HttpResponse.json(searchTitlesPage2Fixture)
    }
    return HttpResponse.json([], { status: 200 })
  }),
])

describe("CosenseRestClient", () => {
  describe("getMe", () => {
    it("認証済みの場合はユーザー情報を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const me = await client.getMe()
      expect(me.name).toBe("テストユーザー")
      expect(me.csrfToken).toBe("test-csrf-token-12345")
    })

    it("未認証の場合は AuthError をスローする", async () => {
      const client = new CosenseRestClient({ sid: "" })
      await expect(client.getMe()).rejects.toThrow()
    })
  })

  describe("listPages", () => {
    it("ページ一覧を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.listPages(TEST_PROJECT)
      expect(result.pages).toHaveLength(2)
      expect(result.pages[0]?.title).toBe("Hello World")
      expect(result.pages[1]?.title).toBe("日本語タイトル")
    })

    it("ページ数を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.listPages(TEST_PROJECT)
      expect(result.count).toBe(2)
    })

    it("存在しないプロジェクトは NotFoundError をスローする", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      await expect(client.listPages("存在しないプロジェクト")).rejects.toThrow()
    })
  })

  describe("getPage", () => {
    it("ページ詳細を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const page = await client.getPage(TEST_PROJECT, "Hello World")
      expect(page.title).toBe("Hello World")
      expect(page.lines).toHaveLength(3)
      expect(page.lines[0]?.text).toBe("Hello World")
    })

    it("存在しないページは NotFoundError をスローする", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      await expect(client.getPage(TEST_PROJECT, "存在しないページ")).rejects.toThrow()
    })
  })

  describe("getPageText", () => {
    it("ページのプレーンテキストを返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const text = await client.getPageText(TEST_PROJECT, "Hello World")
      expect(text).toContain("Hello World")
      expect(text).toContain("最初の行")
    })
  })

  describe("getSmartContext", () => {
    it("hops=1 のとき 1hop エンドポイントのテキストを返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const text = await client.getSmartContext(TEST_PROJECT, "テストページ", 1)
      expect(text).toBe("1hop Smart Context テキスト")
    })

    it("hops=2 のとき 2hop エンドポイントのテキストを返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const text = await client.getSmartContext(TEST_PROJECT, "テストページ", 2)
      expect(text).toBe("2hop Smart Context テキスト")
    })

    it("存在しないページは NotFoundError をスローする", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      await expect(client.getSmartContext(TEST_PROJECT, "存在しないページ", 1)).rejects.toThrow()
    })

    it("NotFoundError のメッセージにクエリ文字列 (?title=...) が含まれない", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      // 存在しないページを指定して 404 を発生させる
      const error = await client
        .getSmartContext(TEST_PROJECT, "存在しないページ", 1)
        .catch((e) => e)
      expect(error).toBeInstanceOf(NotFoundError)
      // pathname は含まれること
      expect(error.message).toContain("/api/smart-context/")
      // クエリ文字列は含まれないこと
      expect(error.message).not.toContain("?")
    })

    it("未認証の場合は AuthError をスローする", async () => {
      const client = new CosenseRestClient({ sid: "" })
      await expect(client.getSmartContext(TEST_PROJECT, "テストページ", 1)).rejects.toThrow()
    })
  })

  describe("searchPages", () => {
    it("クエリにマッチするページを返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.searchPages(TEST_PROJECT, "Hello")
      expect(result.pages).toHaveLength(1)
      expect(result.pages[0]?.title).toBe("Hello World")
    })

    it("マッチしないクエリは空配列を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.searchPages(TEST_PROJECT, "存在しないキーワード")
      expect(result.pages).toHaveLength(0)
    })

    it("存在しないプロジェクトの NotFoundError メッセージにクエリ文字列 (?q=...) が含まれない", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      // 存在しないプロジェクトを指定して 404 を発生させる
      const error = await client
        .searchPages("存在しないプロジェクト", "検索キーワード")
        .catch((e) => e)
      expect(error).toBeInstanceOf(NotFoundError)
      // pathname は含まれること
      expect(error.message).toContain("/api/pages/")
      // クエリ文字列は含まれないこと
      expect(error.message).not.toContain("?")
    })

    it("5xx エラーの CosenseApiError メッセージにクエリ文字列 (?q=...) が含まれない", async () => {
      // 500 を返すハンドラーで一時上書き (afterEach で自動リセットされる)
      server.use(
        http.get(`${BASE_URL}/api/pages/:project/search/query`, () => {
          return HttpResponse.json({ message: "Internal Server Error" }, { status: 500 })
        }),
      )
      const client = new CosenseRestClient({ sid: TEST_SID })
      // クエリパラメータ (?q=...) を含む URL で 500 を発生させる
      const error = await client.searchPages(TEST_PROJECT, "検索キーワード").catch((e) => e)
      expect(error).toBeInstanceOf(CosenseApiError)
      // pathname は含まれること
      expect(error.message).toContain("/api/pages/")
      // クエリ文字列は含まれないこと
      expect(error.message).not.toContain("?")
    })
  })

  describe("searchTitles", () => {
    it("1ページ目のタイトル一覧と followingId を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.searchTitles(TEST_PROJECT)
      // search-titles.json に 5 件
      expect(result.pages).toHaveLength(5)
      expect(result.pages[0]?.title).toBe("はじめに")
      expect(result.pages[0]?.links).toEqual(["TypeScript入門", "プログラミング基礎"])
      // X-following-id ヘッダが設定されている
      expect(result.followingId).toBe("page2-following-id")
    })

    it("followingId を指定すると次のページを返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.searchTitles(TEST_PROJECT, {
        followingId: "page2-following-id",
      })
      // search-titles-page2.json に 2 件
      expect(result.pages).toHaveLength(2)
      expect(result.pages[0]?.title).toBe("お知らせ")
      // 最終ページなので followingId は undefined
      expect(result.followingId).toBeUndefined()
    })

    it("全件を結合してページネーション完走できる", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const allPages = []
      let followingId: string | undefined
      do {
        const searchOpts: { followingId?: string } = {}
        if (followingId !== undefined) searchOpts.followingId = followingId
        const result = await client.searchTitles(TEST_PROJECT, searchOpts)
        allPages.push(...result.pages)
        followingId = result.followingId
      } while (followingId)
      // 計 7 件 (fixture page1: 5件 + page2: 2件)
      expect(allPages).toHaveLength(7)
    })

    it("未認証の場合は AuthError をスローする", async () => {
      const client = new CosenseRestClient({ sid: "" })
      await expect(client.searchTitles(TEST_PROJECT)).rejects.toThrow()
    })
  })

  describe("searchJoinedProjects", () => {
    it("クエリにマッチするプロジェクト一覧を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.searchJoinedProjects("hello")
      expect(result.projects).toHaveLength(2)
      expect(result.projects[0]?.name).toBe("myproject")
      expect(result.projects[0]?.displayName).toBe("マイプロジェクト")
      expect(result.projects[1]?.name).toBe("helpproject")
    })

    it("マッチしないクエリは空の projects 配列を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.searchJoinedProjects("存在しないキーワード")
      expect(result.projects).toHaveLength(0)
    })

    it("未認証の場合は AuthError をスローする", async () => {
      const client = new CosenseRestClient({ sid: "" })
      await expect(client.searchJoinedProjects("hello")).rejects.toThrow()
    })

    it("5xx エラーの CosenseApiError メッセージにクエリ文字列 (?q=...) が含まれない", async () => {
      // 500 を返すハンドラーで一時上書き (afterEach で自動リセットされる)
      server.use(
        http.get(`${BASE_URL}/api/projects/search/query`, () => {
          return HttpResponse.json({ message: "Internal Server Error" }, { status: 500 })
        }),
      )
      const client = new CosenseRestClient({ sid: TEST_SID })
      const error = await client.searchJoinedProjects("検索キーワード").catch((e) => e)
      expect(error).toBeInstanceOf(CosenseApiError)
      // pathname は含まれること
      expect(error.message).toContain("/api/projects/")
      // クエリ文字列は含まれないこと
      expect(error.message).not.toContain("?")
    })
  })

  describe("getSnapshotList", () => {
    it("スナップショット一覧 (pageId + timestamps) を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.getSnapshotList(TEST_PROJECT, "page-id-hello")
      expect(result.pageId).toBe("page-id-hello")
      expect(result.timestamps).toHaveLength(3)
      expect(result.timestamps[0]?.id).toBe("1700000000-snap2")
      expect(result.timestamps[0]?.created).toBe(1700000000)
    })

    it("存在しない pageId は NotFoundError をスローする", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      await expect(client.getSnapshotList(TEST_PROJECT, "存在しないページID")).rejects.toThrow()
    })

    it("未認証の場合は AuthError をスローする", async () => {
      const client = new CosenseRestClient({ sid: "" })
      await expect(client.getSnapshotList(TEST_PROJECT, "page-id-hello")).rejects.toThrow()
    })
  })

  describe("getSnapshot", () => {
    it("指定 timestampId のスナップショット詳細を返す", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      const result = await client.getSnapshot(TEST_PROJECT, "page-id-hello", "1700000000-snap2")
      expect(result.page.title).toBe("Hello World")
      expect(result.snapshot.title).toBe("Hello World")
      expect(result.snapshot.lines).toHaveLength(3)
      expect(result.snapshot.lines[1]?.text).toBe("最初の行のスナップショット内容")
    })

    it("存在しない timestampId は NotFoundError をスローする", async () => {
      const client = new CosenseRestClient({ sid: TEST_SID })
      await expect(
        client.getSnapshot(TEST_PROJECT, "page-id-hello", "存在しないtimestampId"),
      ).rejects.toThrow()
    })

    it("未認証の場合は AuthError をスローする", async () => {
      const client = new CosenseRestClient({ sid: "" })
      await expect(
        client.getSnapshot(TEST_PROJECT, "page-id-hello", "1700000000-snap2"),
      ).rejects.toThrow()
    })
  })
})
