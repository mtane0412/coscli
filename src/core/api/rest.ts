/**
 * rest.ts — Cosense REST API の薄いクライアント実装。
 *
 * connect.sid Cookie を付与して各エンドポイントを叩き、
 * zod スキーマで検証して型安全なレスポンスを返す。
 */

import { encodePageTitle } from "@/core/api/encoder"
import {
  PageListResponseSchema,
  PageSchema,
  SearchResultSchema,
  TitleSearchResultSchema,
} from "@/schemas/page"
import type { Page, PageListResponse, SearchResult, TitleSearchResult } from "@/schemas/page"
import { ProjectListResponseSchema, ProjectSchema } from "@/schemas/project"
import type { Project, ProjectListResponse } from "@/schemas/project"
import { StreamResponseSchema } from "@/schemas/stream"
import type { StreamResponse } from "@/schemas/stream"
import { type Me, MeSchema } from "@/schemas/user"
import { z } from "zod"

const BASE_URL = "https://scrapbox.io"
const ALLOWED_ORIGIN = new URL(BASE_URL).origin
const MAX_REDIRECTS = 5

/** CosenseApiError は API エラーの基底クラス。 */
export class CosenseApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "CosenseApiError"
  }
}

/** AuthError は 401 認証エラー。 */
export class AuthError extends CosenseApiError {
  constructor() {
    super(401, "認証が必要です。`cos auth login` を実行してください。")
    this.name = "AuthError"
  }
}

/** ForbiddenError は 403 権限エラー。 */
export class ForbiddenError extends CosenseApiError {
  constructor() {
    super(403, "このリソースへのアクセス権限がありません。")
    this.name = "ForbiddenError"
  }
}

/** NotFoundError は 404 エラー。 */
export class NotFoundError extends CosenseApiError {
  constructor(resource: string) {
    super(404, `見つかりません: ${resource}`)
    this.name = "NotFoundError"
  }
}

/** RateLimitError は 429 レート制限エラー。 */
export class RateLimitError extends CosenseApiError {
  constructor() {
    super(429, "レート制限に達しました。しばらく待ってから再試行してください。")
    this.name = "RateLimitError"
  }
}

/** CosenseRestClientOptions は REST クライアントの設定オプション。 */
export interface CosenseRestClientOptions {
  /** connect.sid 値 (URLエンコード済みまたは生の値) */
  sid: string
  /** リクエストタイムアウト (ミリ秒、デフォルト 30000) */
  timeout?: number
}

/** CosenseRestClient は Cosense REST API を叩くクライアント。 */
export class CosenseRestClient {
  private readonly sid: string
  private readonly timeout: number

  constructor(opts: CosenseRestClientOptions) {
    this.sid = opts.sid
    this.timeout = opts.timeout ?? 30_000
  }

  /** getMe は /api/users/me を叩いてユーザー情報を返す。 */
  async getMe(): Promise<Me> {
    const data = await this.fetchJson(`${BASE_URL}/api/users/me`)
    return MeSchema.parse(data)
  }

  /** listPages は /api/pages/:project を叩いてページ一覧を返す。 */
  async listPages(
    project: string,
    opts: { skip?: number; limit?: number; sort?: string } = {},
  ): Promise<PageListResponse> {
    const params = new URLSearchParams()
    if (opts.skip !== undefined) params.set("skip", String(opts.skip))
    if (opts.limit !== undefined) params.set("limit", String(opts.limit))
    if (opts.sort) params.set("sort", opts.sort)
    const query = params.size > 0 ? `?${params.toString()}` : ""
    const data = await this.fetchJson(
      `${BASE_URL}/api/pages/${encodeURIComponent(project)}${query}`,
    )
    return PageListResponseSchema.parse(data)
  }

  /** getPage は /api/pages/:project/:title を叩いてページ詳細を返す。 */
  async getPage(project: string, title: string): Promise<Page> {
    const data = await this.fetchJson(
      `${BASE_URL}/api/pages/${encodeURIComponent(project)}/${encodePageTitle(title)}`,
    )
    return PageSchema.parse(data)
  }

  /** getPageText は /api/pages/:project/:title/text を叩いてプレーンテキストを返す。 */
  async getPageText(project: string, title: string): Promise<string> {
    return this.fetchText(
      `${BASE_URL}/api/pages/${encodeURIComponent(project)}/${encodePageTitle(title)}/text`,
    )
  }

  /**
   * getSmartContext は Smart Context API を叩いて指定ページ起点のリンク先本文テキストを返す。
   *
   * エンドポイント:
   *   - hops=1: /api/smart-context/export-1hop-links/:project.txt?title=:title
   *   - hops=2: /api/smart-context/export-2hop-links/:project.txt?title=:title
   *
   * title は encodePageTitle (slug変換) ではなく URLSearchParams (クエリ文字列) で渡す。
   */
  async getSmartContext(project: string, title: string, hops: 1 | 2): Promise<string> {
    const params = new URLSearchParams({ title })
    return this.fetchText(
      `${BASE_URL}/api/smart-context/export-${hops}hop-links/${encodeURIComponent(project)}.txt?${params.toString()}`,
    )
  }

  /** getCodeBlock は /api/code/:project/:title/:filename を叩いてコードブロックを返す。 */
  async getCodeBlock(project: string, title: string, filename: string): Promise<string> {
    return this.fetchText(
      `${BASE_URL}/api/code/${encodeURIComponent(project)}/${encodePageTitle(title)}/${encodeURIComponent(filename)}`,
    )
  }

  /** searchPages は /api/pages/:project/search/query を叩いて全文検索する。 */
  async searchPages(
    project: string,
    query: string,
    opts: { limit?: number } = {},
  ): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query })
    if (opts.limit !== undefined) params.set("limit", String(opts.limit))
    const data = await this.fetchJson(
      `${BASE_URL}/api/pages/${encodeURIComponent(project)}/search/query?${params.toString()}`,
    )
    return SearchResultSchema.parse(data)
  }

  /**
   * searchTitles は /api/pages/:project/search/titles を叩いてタイトル一覧とリンク情報を返す。
   * ページネーションは followingId クエリパラメータと X-following-id レスポンスヘッダで行う。
   */
  async searchTitles(
    project: string,
    opts: { followingId?: string } = {},
  ): Promise<{ pages: TitleSearchResult[]; followingId: string | undefined }> {
    const params = new URLSearchParams()
    if (opts.followingId !== undefined) params.set("followingId", opts.followingId)
    const query = params.size > 0 ? `?${params.toString()}` : ""
    const response = await this.doFetch(
      `${BASE_URL}/api/pages/${encodeURIComponent(project)}/search/titles${query}`,
    )
    const data = await response.json()
    const pages = z.array(TitleSearchResultSchema).parse(data)
    return { pages, followingId: response.headers.get("X-following-id") ?? undefined }
  }

  /** getProject は /api/projects/:project を叩いてプロジェクト情報を返す。 */
  async getProject(project: string): Promise<Project> {
    const data = await this.fetchJson(`${BASE_URL}/api/projects/${encodeURIComponent(project)}`)
    return ProjectSchema.parse(data)
  }

  /** listProjects は /api/projects を叩いて参加プロジェクト一覧を返す。 */
  async listProjects(): Promise<ProjectListResponse> {
    const data = await this.fetchJson(`${BASE_URL}/api/projects`)
    return ProjectListResponseSchema.parse(data)
  }

  /** getProjectStream は /api/stream/:project/ を叩いてプロジェクトの最近更新フィードを返す。 */
  async getProjectStream(project: string, opts: { limit?: number } = {}): Promise<StreamResponse> {
    const params = new URLSearchParams()
    if (opts.limit !== undefined) params.set("limit", String(opts.limit))
    const query = params.size > 0 ? `?${params.toString()}` : ""
    const data = await this.fetchJson(
      `${BASE_URL}/api/stream/${encodeURIComponent(project)}/${query}`,
    )
    return StreamResponseSchema.parse(data)
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    }
    if (this.sid) {
      headers["Cookie"] = `connect.sid=${this.sid}`
    }
    return headers
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await this.doFetch(url)
    return response.json()
  }

  private async fetchText(url: string): Promise<string> {
    const response = await this.doFetch(url)
    return response.text()
  }

  private async doFetch(url: string): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      let currentUrl = url
      for (let redirectCount = 0; ; redirectCount++) {
        const response = await fetch(currentUrl, {
          headers: this.buildHeaders(),
          signal: controller.signal,
          redirect: "manual",
        })

        // 3xx リダイレクト応答を手動処理 (Cookie の外部漏洩防止)
        if (response.status >= 300 && response.status < 400) {
          if (redirectCount >= MAX_REDIRECTS) {
            throw new CosenseApiError(
              0,
              `リダイレクトの上限 (${MAX_REDIRECTS} 回) に達しました: ${url}`,
            )
          }
          const location = response.headers.get("Location")
          if (!location) {
            throw new CosenseApiError(0, `Location ヘッダが見つかりません: ${currentUrl}`)
          }
          const redirectUrl = new URL(location, currentUrl)
          if (redirectUrl.origin !== ALLOWED_ORIGIN) {
            throw new CosenseApiError(
              0,
              `外部ドメインへのリダイレクトを拒否しました: ${redirectUrl.origin}`,
            )
          }
          currentUrl = redirectUrl.href
          continue
        }

        if (!response.ok) {
          await this.handleError(response, url)
        }

        return response
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private async handleError(response: Response, url: string): Promise<never> {
    if (response.status === 401) throw new AuthError()
    if (response.status === 403) throw new ForbiddenError()
    if (response.status === 404) throw new NotFoundError(new URL(url).pathname)
    if (response.status === 429) throw new RateLimitError()
    throw new CosenseApiError(
      response.status,
      `API エラー: ${response.status} ${new URL(url).pathname}`,
    )
  }
}
