/**
 * types.ts — ブラウザ CDP 連携で使用するインターフェイス集約。
 *
 * Fetcher / WebSocketLike / WebSocketFactory / BrowserFinder / CdpClient を定義し、
 * infra/browser 配下の各モジュールおよび core/auth/browser-login.ts が参照する。
 * テスト時はこれらの型を実装したフェイクを注入することで実 I/O を回避できる。
 */

/** CdpCookie は Chrome DevTools Protocol が返す Cookie の形状。 */
export interface CdpCookie {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
}

/**
 * Fetcher は HTTP リクエストを行う関数の型。
 * テスト時はインメモリのスタブを注入して実 HTTP を回避する。
 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/**
 * WebSocketLike は WebSocket クライアントの最小インターフェイス。
 * Bun の WebSocket は Web 標準互換なので本番ではそのまま使用できる。
 */
export interface WebSocketLike {
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: "message" | "open" | "close" | "error",
    listener: (event: MessageEvent | Event) => void,
  ): void
}

/**
 * WebSocketFactory は WebSocket インスタンスを生成する関数の型。
 * テスト時はフェイク WebSocket を返すスタブを注入する。
 */
export type WebSocketFactory = (url: string) => WebSocketLike

/**
 * BrowserFinder は Chrome/Chromium バイナリを探索するインターフェイス。
 * find は見つかった実行ファイルの絶対パスを返す。未検出時は null を返す。
 */
export interface BrowserFinder {
  find(opts?: { override?: string }): Promise<string | null>
}

/**
 * CdpClient は Chrome DevTools Protocol クライアントの最小インターフェイス。
 * ページナビゲーション・Cookie 取得・ブラウザ終了・接続切断を提供する。
 */
export interface CdpClient {
  /** navigate は指定 URL にページを遷移する。 */
  navigate(url: string): Promise<void>
  /** getCookies は指定 URL に対応する Cookie の一覧を取得する。 */
  getCookies(urls?: string[]): Promise<CdpCookie[]>
  /** closeBrowser はブラウザプロセスを CDP 経由で終了する。 */
  closeBrowser(): Promise<void>
  /** disconnect は WebSocket 接続を切断する。 */
  disconnect(): Promise<void>
}
