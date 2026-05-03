/**
 * router.ts — HTTP メソッドとパスを対応するハンドラキーと params にマッピングする。
 *
 * パステンプレート（例: /api/pages/:title）を正規表現で評価し、
 * params オブジェクトにデコード済みの値を格納して返す。
 */

/** RouteKey はルーターが識別する各エンドポイントのキー。 */
export type RouteKey =
  | "healthz"
  | "listPages"
  | "getPage"
  | "getPageText"
  | "createPage"
  | "editPage"
  | "deletePage"

/** RouteMatch はマッチ結果。key でハンドラを選択し params で動的セグメントを取得する。 */
export interface RouteMatch {
  key: RouteKey
  params: Record<string, string>
}

/** RouteDef はルート定義。メソッド・テンプレート・named capture group で構成する。 */
interface RouteDef {
  method: string
  pattern: RegExp
  key: RouteKey
  paramNames: string[]
}

/** ROUTES は全ルート定義の一覧。上から順に評価する。 */
const ROUTES: RouteDef[] = [
  {
    method: "GET",
    pattern: /^\/healthz$/,
    key: "healthz",
    paramNames: [],
  },
  {
    method: "GET",
    // /text サフィックスを先に評価してから /:title にフォールバックするため先に定義
    pattern: /^\/api\/pages\/([^/]+)\/text$/,
    key: "getPageText",
    paramNames: ["title"],
  },
  {
    method: "GET",
    pattern: /^\/api\/pages\/([^/]+)$/,
    key: "getPage",
    paramNames: ["title"],
  },
  {
    method: "GET",
    pattern: /^\/api\/pages$/,
    key: "listPages",
    paramNames: [],
  },
  {
    method: "POST",
    pattern: /^\/api\/pages$/,
    key: "createPage",
    paramNames: [],
  },
  {
    method: "PUT",
    pattern: /^\/api\/pages\/([^/]+)$/,
    key: "editPage",
    paramNames: ["title"],
  },
  {
    method: "DELETE",
    pattern: /^\/api\/pages\/([^/]+)$/,
    key: "deletePage",
    paramNames: ["title"],
  },
]

/**
 * route はリクエストの HTTP メソッドとパスをルート定義と照合する。
 * マッチした場合は RouteMatch を、マッチしない場合は null を返す。
 */
export function route(method: string, pathname: string): RouteMatch | null {
  for (const def of ROUTES) {
    if (def.method !== method) continue
    const match = def.pattern.exec(pathname)
    if (!match) continue

    const params: Record<string, string> = {}
    for (let i = 0; i < def.paramNames.length; i++) {
      const name = def.paramNames[i]
      const value = match[i + 1]
      if (name !== undefined && value !== undefined) {
        // URL エンコードされたパスセグメントをデコードする
        params[name] = decodeURIComponent(value)
      }
    }
    return { key: def.key, params }
  }
  return null
}
