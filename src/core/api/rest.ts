/**
 * rest.ts — Cosense REST API の薄いクライアント実装。
 *
 * connect.sid Cookie を付与して各エンドポイントを叩き、
 * zod スキーマで検証して型安全なレスポンスを返す。
 */

import { encodePageTitle } from "@/core/api/encoder"
import { PageListResponseSchema, PageSchema, SearchResultSchema } from "@/schemas/page"
import type { Page, PageListResponse, SearchResult } from "@/schemas/page"
import { ProjectListResponseSchema, ProjectSchema } from "@/schemas/project"
import type { Project, ProjectListResponse } from "@/schemas/project"
import { type Me, MeSchema } from "@/schemas/user"

const BASE_URL = "https://scrapbox.io"

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

    let response: Response
    try {
      response = await fetch(url, {
        headers: this.buildHeaders(),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      await this.handleError(response, url)
    }

    return response
  }

  private async handleError(response: Response, url: string): Promise<never> {
    if (response.status === 401) throw new AuthError()
    if (response.status === 403) throw new ForbiddenError()
    if (response.status === 404) throw new NotFoundError(url)
    if (response.status === 429) throw new RateLimitError()
    throw new CosenseApiError(response.status, `API エラー: ${response.status} ${url}`)
  }
}
