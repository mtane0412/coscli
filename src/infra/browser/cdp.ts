/**
 * cdp.ts — Chrome DevTools Protocol (CDP) クライアントの最小実装。
 *
 * HTTP (/json/version, /json/list) でデバッグ WS URL を取得し、
 * WebSocket 経由で JSON-RPC コマンド (Page.navigate / Network.enable /
 * Network.getCookies / Browser.close) を送受信する。
 *
 * Fetcher / WebSocketFactory を DI 引数として受け取るため、
 * テスト時はフェイク実装を注入して実 IO を回避できる。
 */

import type { CdpClient, CdpCookie, Fetcher, WebSocketFactory, WebSocketLike } from "./types"

/** connectCdpOpts は connectCdp に渡すオプション。 */
export interface ConnectCdpOpts {
  /** port は CDP デバッグポート番号。 */
  port: number
  /** fetcher は HTTP リクエスト実装。省略時は globalThis.fetch を使用する。 */
  fetcher: Fetcher
  /** wsFactory は WebSocket インスタンスを生成する関数。 */
  wsFactory: WebSocketFactory
  /** pollIntervalMs は /json/version ポーリング間隔 (ms)。省略時 200ms。 */
  pollIntervalMs?: number
  /** readyTimeoutMs は CDP 接続準備タイムアウト (ms)。省略時 10000ms。 */
  readyTimeoutMs?: number
}

/** CdpRequest は CDP JSON-RPC リクエストの型。 */
interface CdpRequest {
  id: number
  method: string
  params?: Record<string, unknown>
}

/** CdpResponse は CDP JSON-RPC レスポンスの型。 */
interface CdpResponse {
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

/** sleep は指定 ms 待機する。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * CdpSession は単一の WebSocket 接続に対して CDP JSON-RPC を送受信する。
 * 送信したコマンドの id と Promise を対応付けて非同期解決する。
 * WS 切断・エラー時は pending な Promise をすべて reject する。
 */
class CdpSession {
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }
  >()

  constructor(private readonly ws: WebSocketLike) {
    ws.addEventListener("message", (e) => {
      const msg = e as MessageEvent
      const response = JSON.parse(msg.data as string) as CdpResponse
      if (response.id !== undefined) {
        const entry = this.pending.get(response.id)
        if (entry) {
          this.pending.delete(response.id)
          if (response.error) {
            entry.reject(new Error(`CDP ${response.error.code}: ${response.error.message}`))
          } else {
            entry.resolve(response.result ?? {})
          }
        }
      }
    })

    // WS 切断・エラー時に pending な Promise をすべて reject する
    const failAll = (reason: string) => {
      for (const { reject } of this.pending.values()) reject(new Error(reason))
      this.pending.clear()
    }
    ws.addEventListener("close", () => failAll("CDP WebSocket が切断されました"))
    ws.addEventListener("error", () => failAll("CDP WebSocket エラーが発生しました"))
  }

  /**
   * send は CDP コマンドを送信し、対応するレスポンスを待って結果を返す。
   */
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.nextId++
    const req: CdpRequest = { id, method }
    if (params !== undefined) req.params = params
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(req))
    })
  }

  /** close は WebSocket を閉じる。 */
  close(): void {
    this.ws.close()
  }
}

/**
 * waitForWsUrl は CDP デバッグポートが利用可能になるまでポーリングし、
 * ブラウザの WS デバッガー URL を返す。
 */
async function waitForWsUrl(
  fetcher: Fetcher,
  port: number,
  pollIntervalMs: number,
  readyTimeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + readyTimeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetcher(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) {
        const json = (await res.json()) as { webSocketDebuggerUrl?: string }
        if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl
      }
    } catch {
      // 接続前の ECONNREFUSED 等は無視して再試行する
    }
    if (pollIntervalMs > 0) await sleep(pollIntervalMs)
  }
  throw new Error(`CDP デバッグポート ${port} が ${readyTimeoutMs}ms 以内に応答しませんでした`)
}

/**
 * getPageWsUrl は /json/list から page タイプの WebSocket URL を取得する。
 * page ターゲットがない場合は最初のターゲットの URL を返す。
 */
async function getPageWsUrl(fetcher: Fetcher, port: number): Promise<string> {
  const res = await fetcher(`http://127.0.0.1:${port}/json/list`)
  const targets = (await res.json()) as { type?: string; webSocketDebuggerUrl?: string }[]
  const page = targets.find((t) => t.type === "page") ?? targets[0]
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("CDP: page ターゲットが見つかりませんでした")
  }
  return page.webSocketDebuggerUrl
}

/**
 * openSession は指定 WS URL に接続し、open イベント後に CdpSession を返す。
 * connectTimeoutMs 以内に open しなければ reject する。
 */
function openSession(
  wsFactory: WebSocketFactory,
  url: string,
  connectTimeoutMs = 5_000,
): Promise<CdpSession> {
  return new Promise((resolve, reject) => {
    const ws = wsFactory(url)
    const session = new CdpSession(ws)

    const timer = setTimeout(() => {
      reject(new Error(`CDP WS 接続タイムアウト: ${url}`))
    }, connectTimeoutMs)

    ws.addEventListener("open", () => {
      clearTimeout(timer)
      resolve(session)
    })
    ws.addEventListener("error", (e) => {
      clearTimeout(timer)
      reject(new Error(`CDP WS エラー: ${String(e)}`))
    })
    ws.addEventListener("close", () => {
      clearTimeout(timer)
      reject(new Error(`CDP WS が接続前に閉じました: ${url}`))
    })
  })
}

/**
 * connectCdp は CDP クライアントを初期化して返す。
 *
 * ポーリングで CDP ポートが立ち上がるのを待ち、page ターゲットに接続後、
 * Network.enable を送信してから CdpClient インスタンスを返す。
 */
export async function connectCdp(opts: ConnectCdpOpts): Promise<CdpClient> {
  const { port, fetcher, wsFactory } = opts
  const pollIntervalMs = opts.pollIntervalMs ?? 200
  const readyTimeoutMs = opts.readyTimeoutMs ?? 10_000

  // CDP ポートが立ち上がるのを待ち、ブラウザ WS URL を取得する
  const browserWsUrl = await waitForWsUrl(fetcher, port, pollIntervalMs, readyTimeoutMs)

  // page ターゲットの WS URL を取得する
  const pageWsUrl = await getPageWsUrl(fetcher, port)

  // ページ WS に接続する
  const pageSession = await openSession(wsFactory, pageWsUrl)

  // Network.enable を送信して Cookie 監視を開始する
  await pageSession.send("Network.enable")

  return {
    async navigate(url: string): Promise<void> {
      await pageSession.send("Page.navigate", { url })
    },

    async getCookies(urls?: string[]): Promise<CdpCookie[]> {
      const params: Record<string, unknown> = {}
      // exactOptionalPropertyTypes 対応: undefined は渡さない
      if (urls !== undefined) params["urls"] = urls
      const result = await pageSession.send("Network.getCookies", params)
      const raw = result["cookies"]
      if (!Array.isArray(raw)) return []
      return raw as CdpCookie[]
    },

    async closeBrowser(): Promise<void> {
      // ブラウザ WS に接続して Browser.close を送信する
      const browserSession = await openSession(wsFactory, browserWsUrl)
      await browserSession.send("Browser.close")
      browserSession.close()
    },

    async disconnect(): Promise<void> {
      pageSession.close()
    },
  }
}
