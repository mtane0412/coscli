/**
 * rest.pat.test.ts — Personal Access Token (PAT) を使った REST クライアントのテスト。
 *
 * PAT 認証では x-personal-access-token ヘッダを送り、
 * csrfToken が /api/users/me から返らないため replaceLinks は使用不可になる。
 */

import { beforeEach, describe, expect, it } from "bun:test"
import { CosenseRestClient } from "@/core/api/rest"
import { http, HttpResponse } from "msw"
import { useMswServer } from "../../../helpers/msw"

import mePATFixture from "../../../fixtures/me-pat.json"
import pageListFixture from "../../../fixtures/page-list.json"
import searchTitlesFixture from "../../../fixtures/search-titles.json"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"
// テスト用 PAT (pat_ + 64桁小文字16進数)
const VALID_PAT = `pat_${"a".repeat(64)}`

const _server = useMswServer([
  // /api/users/me — PAT ヘッダで認証、csrfToken なしで返す
  http.get(`${BASE_URL}/api/users/me`, ({ request }) => {
    const pat = request.headers.get("x-personal-access-token")
    if (pat === VALID_PAT) {
      return HttpResponse.json(mePATFixture)
    }
    // Cookie のみ or 無効なヘッダは 401
    return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
  }),

  // /api/pages/:project — PAT ヘッダで認証 (msw は path params を自動デコードする)
  http.get(`${BASE_URL}/api/pages/:project`, ({ params, request }) => {
    const pat = request.headers.get("x-personal-access-token")
    if (pat !== VALID_PAT) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (params["project"] === TEST_PROJECT) {
      return HttpResponse.json(pageListFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  // /api/pages/:project/search/titles — PAT ヘッダで認証 (msw は path params を自動デコードする)
  http.get(`${BASE_URL}/api/pages/:project/search/titles`, ({ params, request }) => {
    const pat = request.headers.get("x-personal-access-token")
    if (pat !== VALID_PAT) {
      return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
    if (params["project"] === TEST_PROJECT) {
      return HttpResponse.json(searchTitlesFixture)
    }
    return HttpResponse.json({ message: "Not found" }, { status: 404 })
  }),

  // /api/smart-context — PAT ヘッダで認証
  http.get(`${BASE_URL}/api/smart-context/export-1hop-links/:project`, ({ params, request }) => {
    const pat = request.headers.get("x-personal-access-token")
    if (pat !== VALID_PAT) {
      return new HttpResponse("Unauthorized", { status: 401 })
    }
    const projectParam = decodeURIComponent(params["project"] as string)
    const project = projectParam.endsWith(".txt") ? projectParam.slice(0, -4) : projectParam
    const url = new URL(request.url)
    const title = url.searchParams.get("title")
    if (project === TEST_PROJECT && title === "テストページ") {
      return new HttpResponse("PAT Smart Context テキスト")
    }
    return new HttpResponse("Not found", { status: 404 })
  }),
])

describe("CosenseRestClient — コンストラクタの 3-way 排他チェック", () => {
  it("sid のみ指定: 正常に生成できる", () => {
    expect(() => new CosenseRestClient({ sid: "s%3Atest-sid" })).not.toThrow()
  })

  it("serviceAccountKey のみ指定: 正常に生成できる", () => {
    const saKey = `cs_${"0".repeat(64)}`
    expect(() => new CosenseRestClient({ serviceAccountKey: saKey })).not.toThrow()
  })

  it("personalAccessToken のみ指定: 正常に生成できる", () => {
    expect(() => new CosenseRestClient({ personalAccessToken: VALID_PAT })).not.toThrow()
  })

  it("何も指定しない場合はエラーをスローする", () => {
    expect(() => new CosenseRestClient({})).toThrow()
  })

  it("sid + personalAccessToken を同時指定するとエラーをスローする", () => {
    expect(
      () => new CosenseRestClient({ sid: "s%3Atest-sid", personalAccessToken: VALID_PAT }),
    ).toThrow()
  })

  it("serviceAccountKey + personalAccessToken を同時指定するとエラーをスローする", () => {
    const saKey = `cs_${"0".repeat(64)}`
    expect(
      () => new CosenseRestClient({ serviceAccountKey: saKey, personalAccessToken: VALID_PAT }),
    ).toThrow()
  })

  it("sid + serviceAccountKey を同時指定するとエラーをスローする (既存の排他チェック維持)", () => {
    const saKey = `cs_${"0".repeat(64)}`
    expect(() => new CosenseRestClient({ sid: "s%3Atest-sid", serviceAccountKey: saKey })).toThrow()
  })

  it("sid + serviceAccountKey + personalAccessToken を同時指定するとエラーをスローする", () => {
    const saKey = `cs_${"0".repeat(64)}`
    expect(
      () =>
        new CosenseRestClient({
          sid: "s%3Atest-sid",
          serviceAccountKey: saKey,
          personalAccessToken: VALID_PAT,
        }),
    ).toThrow()
  })
})

describe("CosenseRestClient — PAT 認証で REST 読み取り API", () => {
  let client: CosenseRestClient

  beforeEach(() => {
    // PAT を使用した REST クライアント
    client = new CosenseRestClient({ personalAccessToken: VALID_PAT })
  })

  it("getMe: x-personal-access-token ヘッダを送り、csrfToken なしでユーザー情報を返す", async () => {
    const me = await client.getMe()
    expect(me.name).toBe("テストユーザー")
    // PAT セッションでは csrfToken が返らない
    expect(me.csrfToken).toBeUndefined()
  })

  it("listPages: PAT 認証でページ一覧を取得できる", async () => {
    const result = await client.listPages(TEST_PROJECT)
    expect(result.pages.length).toBeGreaterThan(0)
  })

  it("searchTitles: PAT 認証でタイトル検索できる", async () => {
    const result = await client.searchTitles(TEST_PROJECT)
    expect(Array.isArray(result.pages)).toBe(true)
  })

  it("getSmartContext (1hop): PAT 認証でリンク先テキストを取得できる", async () => {
    const text = await client.getSmartContext(TEST_PROJECT, "テストページ", 1)
    expect(text).toBe("PAT Smart Context テキスト")
  })
})

describe("CosenseRestClient — PAT 認証での replaceLinks", () => {
  it("csrfToken が返らない PAT セッションで replaceLinks を呼ぶと AUTH_WRITE_NOT_SUPPORTED エラーをスローする", async () => {
    // PAT セッションでは getMe が csrfToken を返さないため、replaceLinks は使用不可
    const client = new CosenseRestClient({ personalAccessToken: VALID_PAT })
    await expect(client.replaceLinks(TEST_PROJECT, "旧リンク", "新リンク")).rejects.toThrow(
      "AUTH_WRITE_NOT_SUPPORTED",
    )
  })
})
