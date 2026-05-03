/**
 * rest.ts — Bun.serve に渡す fetch ハンドラの生成。
 *
 * createFetchHandler に ServerContext を渡すことで、
 * Cosense API への認証付きプロキシとして機能する fetch ハンドラを返す。
 * ハンドラは純粋関数として単体テスト可能。
 */

import { createPage, deletePage, editPage, getPage, getPageText, listPages } from "@/core/pages"
import { PolicyError } from "@/core/sandbox"
import { toHttpResponse } from "@/core/server/errors"
import { type RouteKey, route } from "@/core/server/router"
import type { ServerContext } from "@/core/server/types"
import { CreatePageBody, EditPageBody } from "@/core/server/types"

/** SuccessBody は成功時の HTTP レスポンスボディ形式。 */
interface SuccessBody<T> {
  ok: true
  data: T
}

/** buildOkResponse は成功時の JSON レスポンスを生成する。 */
function buildOkResponse<T>(data: T, status = 200): Response {
  const body: SuccessBody<T> = { ok: true, data }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** WRITE_DISABLED_ERROR は書き込み無効時のレスポンス。 */
function buildWriteDisabledResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: { code: "WRITE_DISABLED", message: "--allow-write を指定してください" },
    }),
    { status: 405, headers: { "Content-Type": "application/json" } },
  )
}

/** buildRouteNotFoundResponse は未知ルートのレスポンス。 */
function buildRouteNotFoundResponse(method: string, pathname: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: { code: "ROUTE_NOT_FOUND", message: `${method} ${pathname} は定義されていません` },
    }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  )
}

/**
 * checkToken はプロキシ Bearer トークンを検証する。
 * ctx.token が設定されている場合のみ検証し、
 * 一致しない場合は 401 PROXY_AUTH_REQUIRED のレスポンスを返す。
 * 問題なければ null を返す。
 */
function checkToken(ctx: ServerContext, req: Request): Response | null {
  if (!ctx.token) return null
  const auth = req.headers.get("Authorization")
  if (!auth || auth !== `Bearer ${ctx.token}`) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "PROXY_AUTH_REQUIRED", message: "Bearer トークンが必要です" },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )
  }
  return null
}

/**
 * checkPolicy は sandbox ポリシーを検証する。
 * PolicyError が返った場合は 403 のレスポンスを返す。null なら通過。
 */
function checkPolicy(ctx: ServerContext, command: string): Response | null {
  const err = ctx.policy.allow(command)
  if (err instanceof PolicyError) {
    return toHttpResponse(err)
  }
  return null
}

/**
 * parseJsonBody は JSON リクエストボディをパースする。
 * パースに失敗した場合は SyntaxError をスローし、toHttpResponse で 400 に変換される。
 */
async function parseJsonBody(req: Request): Promise<unknown> {
  const text = await req.text()
  return JSON.parse(text)
}

/**
 * createFetchHandler は ServerContext を受け取り、
 * Bun.serve の fetch オプションに渡す Request → Response ハンドラを返す。
 */
export function createFetchHandler(ctx: ServerContext): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      const url = new URL(req.url)
      const pathname = url.pathname

      // ルートマッチング
      const matched = route(req.method, pathname)
      if (!matched) return buildRouteNotFoundResponse(req.method, pathname)

      const { key, params } = matched

      // healthz は token 認証・sandbox チェックをスキップ
      if (key === "healthz") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      // プロキシ token 認証チェック（healthz 以外のすべてのルートに適用）
      const tokenError = checkToken(ctx, req)
      if (tokenError) return tokenError

      // 書き込み系ルートで allowWrite=false なら即座に 405
      const isWrite = key === "createPage" || key === "editPage" || key === "deletePage"
      if (isWrite && !ctx.allowWrite) {
        return buildWriteDisabledResponse()
      }

      // sandbox ポリシーチェック（ルートキーをコマンド名に変換）
      // 網羅型にして新規 RouteKey 追加時のコンパイルエラーでチェック漏れを防ぐ
      const commandMap: Record<Exclude<RouteKey, "healthz">, string> = {
        listPages: "page.list",
        getPage: "page.get",
        getPageText: "page.text",
        createPage: "page.new",
        editPage: "page.edit",
        deletePage: "page.delete",
      }
      const policyError = checkPolicy(ctx, commandMap[key as Exclude<RouteKey, "healthz">])
      if (policyError) return policyError

      // ルートハンドラ
      if (key === "listPages") {
        const skipStr = url.searchParams.get("skip")
        const limitStr = url.searchParams.get("limit")
        const sort = url.searchParams.get("sort") ?? undefined

        // skip/limit は整数文字列のみ許可（parseInt は先頭数値を通すため正規表現で検証）
        const intPattern = /^-?\d+$/
        const skip = skipStr !== null && intPattern.test(skipStr) ? Number(skipStr) : undefined
        const limit = limitStr !== null && intPattern.test(limitStr) ? Number(limitStr) : undefined
        if (skipStr !== null && skip === undefined) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: { code: "VALIDATION_ERROR", message: "skip は整数である必要があります" },
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          )
        }
        if (limitStr !== null && limit === undefined) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: { code: "VALIDATION_ERROR", message: "limit は整数である必要があります" },
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          )
        }

        const result = await listPages(ctx.restClient, {
          project: ctx.project,
          ...(skip !== undefined ? { skip } : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(sort !== undefined ? { sort } : {}),
        })
        return buildOkResponse(result)
      }

      if (key === "getPage") {
        const title = params["title"] ?? ""
        const result = await getPage(ctx.restClient, { project: ctx.project, title })
        return buildOkResponse(result)
      }

      if (key === "getPageText") {
        const title = params["title"] ?? ""
        const text = await getPageText(ctx.restClient, { project: ctx.project, title })
        return new Response(text, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }

      if (key === "createPage") {
        const raw = await parseJsonBody(req)
        const body = CreatePageBody.parse(raw)
        const result = await createPage(ctx.writer, {
          project: ctx.project,
          title: body.title,
          lines: body.lines,
        })
        return buildOkResponse(result)
      }

      if (key === "editPage") {
        const title = params["title"] ?? ""
        const raw = await parseJsonBody(req)
        const body = EditPageBody.parse(raw)
        const result = await editPage(ctx.writer, {
          project: ctx.project,
          title,
          lines: body.lines,
        })
        return buildOkResponse(result)
      }

      if (key === "deletePage") {
        const title = params["title"] ?? ""
        const result = await deletePage(ctx.writer, { project: ctx.project, title })
        return buildOkResponse(result)
      }

      // ここには到達しないが型安全のためフォールバック
      return buildRouteNotFoundResponse(req.method, pathname)
    } catch (err) {
      return toHttpResponse(err)
    }
  }
}
