/**
 * cdp.test.ts — connectCdp と CdpClient のユニットテスト。
 *
 * 実 HTTP / WebSocket は使わず、FakeFetcher と FakeWebSocket を注入して
 * CDP プロトコルのシリアライズ / デシリアライズとコマンド送受信ロジックを検証する。
 */

import { describe, expect, it } from "bun:test"
import { connectCdp } from "@/infra/browser/cdp"
import type { CdpCookie, Fetcher, WebSocketFactory, WebSocketLike } from "@/infra/browser/types"

// ---------------------------------------------------------------------------
// FakeWebSocket — CDP WebSocket 接続のフェイク実装
// ---------------------------------------------------------------------------

/** FakeWebSocket は CDP クライアントに注入するテスト用 WebSocket 。 */
class FakeWebSocket implements WebSocketLike {
  readonly sent: string[] = []
  private listeners = new Map<string, ((e: MessageEvent | Event) => void)[]>()

  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.trigger("close", new Event("close"))
  }
  addEventListener(
    type: "message" | "open" | "close" | "error",
    listener: (e: MessageEvent | Event) => void,
  ): void {
    const existing = this.listeners.get(type) ?? []
    this.listeners.set(type, [...existing, listener])
  }

  /** triggerOpen は "open" イベントを発火する。 */
  triggerOpen(): void {
    this.trigger("open", new Event("open"))
  }
  /** triggerMessage は "message" イベントとして指定データを発火する。 */
  triggerMessage(data: unknown): void {
    const event = { data: JSON.stringify(data) } as MessageEvent
    this.trigger("message", event)
  }
  private trigger(type: string, event: Event | MessageEvent): void {
    for (const l of this.listeners.get(type) ?? []) l(event)
  }
}

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

const PAGE_WS_URL = "ws://127.0.0.1:9222/devtools/page/テストページ-uuid"
const BROWSER_WS_URL = "ws://127.0.0.1:9222/devtools/browser/テストブラウザ-uuid"

/** buildFetcher は /json/version と /json/list の両エンドポイントを返すフェイク Fetcher を生成する。 */
function buildFetcher(): Fetcher {
  return async (url: string) => {
    if (url.includes("/json/version")) {
      return new Response(
        JSON.stringify({
          Browser: "Chrome/120.0.0.0",
          webSocketDebuggerUrl: BROWSER_WS_URL,
        }),
      )
    }
    if (url.includes("/json/list")) {
      return new Response(
        JSON.stringify([
          {
            id: "テストページ-uuid",
            type: "page",
            url: "https://scrapbox.io/login",
            webSocketDebuggerUrl: PAGE_WS_URL,
          },
        ]),
      )
    }
    return new Response("Not Found", { status: 404 })
  }
}

/** buildAutoWsFactory は wsFactory が呼ばれた際に自動で open イベントを送り CDP 応答を返す WebSocket を作成する。 */
function buildAutoWsFactory(respondWith: (method: string, id: number) => unknown | undefined): {
  wsFactory: WebSocketFactory
  getWs: (url: string) => FakeWebSocket
} {
  const wsMap = new Map<string, FakeWebSocket>()

  const wsFactory: WebSocketFactory = (url: string) => {
    const ws = new FakeWebSocket()
    wsMap.set(url, ws)

    // open イベントをマイクロタスクキューで発火する
    queueMicrotask(() => {
      ws.triggerOpen()
    })

    // CDP コマンドへの自動応答
    const originalSend = ws.send.bind(ws)
    ws.send = (data: string) => {
      originalSend(data)
      const msg = JSON.parse(data) as { id: number; method: string }
      const result = respondWith(msg.method, msg.id)
      if (result !== undefined) {
        queueMicrotask(() => {
          ws.triggerMessage({ id: msg.id, result })
        })
      }
    }

    return ws
  }

  return { wsFactory, getWs: (url) => wsMap.get(url) as FakeWebSocket }
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("connectCdp", () => {
  it("Network.enable を送信して CdpClient を返す", async () => {
    const { wsFactory, getWs } = buildAutoWsFactory(() => ({}))
    const fetcher = buildFetcher()

    const client = await connectCdp({ port: 9222, fetcher, wsFactory })
    expect(client).toBeDefined()

    const ws = getWs(PAGE_WS_URL)
    expect(ws).toBeDefined()
    // Network.enable がページ WS に送信されていることを確認する
    const sentMethods = ws.sent.map((s) => (JSON.parse(s) as { method: string }).method)
    expect(sentMethods).toContain("Network.enable")
  })

  it("/json/version へのポーリングで最初の試行が 404 の場合でも再試行して成功する", async () => {
    let callCount = 0
    const fetcher: Fetcher = async (url: string) => {
      if (url.includes("/json/version")) {
        callCount++
        // 最初の 1 回は失敗させる
        if (callCount === 1) return new Response("Not Found", { status: 404 })
        return new Response(JSON.stringify({ webSocketDebuggerUrl: BROWSER_WS_URL }))
      }
      if (url.includes("/json/list")) {
        return new Response(JSON.stringify([{ type: "page", webSocketDebuggerUrl: PAGE_WS_URL }]))
      }
      return new Response("", { status: 404 })
    }

    const { wsFactory } = buildAutoWsFactory(() => ({}))
    const client = await connectCdp({ port: 9222, fetcher, wsFactory, pollIntervalMs: 0 })
    expect(client).toBeDefined()
    expect(callCount).toBeGreaterThanOrEqual(2)
  })

  it("readyTimeoutMs 超過で reject する", async () => {
    // 常に失敗するフェッチャー
    const fetcher: Fetcher = async () => new Response("", { status: 503 })
    const { wsFactory } = buildAutoWsFactory(() => ({}))

    await expect(
      connectCdp({ port: 9222, fetcher, wsFactory, pollIntervalMs: 0, readyTimeoutMs: 10 }),
    ).rejects.toThrow()
  })

  it("page タイプのターゲットが存在しない場合は最初のターゲットにフォールバックする", async () => {
    const fallbackWsUrl = "ws://127.0.0.1:9222/devtools/other/フォールバック-uuid"
    const fetcher: Fetcher = async (url: string) => {
      if (url.includes("/json/version")) {
        return new Response(JSON.stringify({ webSocketDebuggerUrl: BROWSER_WS_URL }))
      }
      if (url.includes("/json/list")) {
        return new Response(
          // page 以外のターゲットのみ
          JSON.stringify([{ type: "browser", webSocketDebuggerUrl: fallbackWsUrl }]),
        )
      }
      return new Response("", { status: 404 })
    }

    const { wsFactory, getWs } = buildAutoWsFactory(() => ({}))
    const client = await connectCdp({ port: 9222, fetcher, wsFactory })
    expect(client).toBeDefined()
    // フォールバック WS に接続されていることを確認する
    expect(getWs(fallbackWsUrl)).toBeDefined()
  })
})

describe("CdpClient.navigate", () => {
  it("Page.navigate を正しい URL で送信し解決する", async () => {
    const { wsFactory, getWs } = buildAutoWsFactory(() => ({}))
    const client = await connectCdp({ port: 9222, fetcher: buildFetcher(), wsFactory })

    await client.navigate("https://scrapbox.io/login")

    const ws = getWs(PAGE_WS_URL)
    const navigateCmd = ws.sent
      .map((s) => JSON.parse(s) as { method: string; params: { url?: string } })
      .find((m) => m.method === "Page.navigate")
    expect(navigateCmd?.params.url).toBe("https://scrapbox.io/login")
  })
})

describe("CdpClient.getCookies", () => {
  const loggedInCookies: CdpCookie[] = [
    {
      name: "connect.sid",
      value: "サンプルSID-12345",
      domain: ".scrapbox.io",
      path: "/",
      httpOnly: true,
      secure: true,
    },
    {
      name: "XSRF-TOKEN",
      value: "ダミートークン",
      domain: ".scrapbox.io",
      path: "/",
      httpOnly: false,
      secure: false,
    },
  ]

  it("Network.getCookies の結果を返す", async () => {
    const { wsFactory } = buildAutoWsFactory((method) => {
      if (method === "Network.getCookies") return { cookies: loggedInCookies }
      return {}
    })

    const client = await connectCdp({ port: 9222, fetcher: buildFetcher(), wsFactory })
    const cookies = await client.getCookies()

    expect(cookies).toHaveLength(loggedInCookies.length)
    const firstCookie = cookies[0]
    expect(firstCookie).toBeDefined()
    expect(firstCookie?.name).toBe("connect.sid")
    expect(firstCookie?.value).toBe("サンプルSID-12345")
  })

  it("urls 引数を指定した場合は params に含めて送信する", async () => {
    const { wsFactory, getWs } = buildAutoWsFactory((method) => {
      if (method === "Network.getCookies") return { cookies: [] }
      return {}
    })

    const client = await connectCdp({ port: 9222, fetcher: buildFetcher(), wsFactory })
    await client.getCookies(["https://scrapbox.io"])

    const ws = getWs(PAGE_WS_URL)
    const getCookiesCmd = ws.sent
      .map((s) => JSON.parse(s) as { method: string; params: { urls?: string[] } })
      .find((m) => m.method === "Network.getCookies")
    expect(getCookiesCmd).toBeDefined()
    expect(getCookiesCmd?.params?.urls).toContain("https://scrapbox.io")
  })
})

describe("CdpClient.closeBrowser", () => {
  it("Browser.close をブラウザ WS 経由で送信する", async () => {
    const { wsFactory, getWs } = buildAutoWsFactory(() => ({}))
    const client = await connectCdp({ port: 9222, fetcher: buildFetcher(), wsFactory })

    await client.closeBrowser()

    // ブラウザ WS に Browser.close が送信されていることを確認する
    const browserWs = getWs(BROWSER_WS_URL)
    expect(browserWs).toBeDefined()
    const methods = browserWs.sent.map((s) => (JSON.parse(s) as { method: string }).method)
    expect(methods).toContain("Browser.close")
  })
})

describe("CdpClient.disconnect", () => {
  it("disconnect はページ WS を閉じる", async () => {
    const { wsFactory, getWs } = buildAutoWsFactory(() => ({}))
    const client = await connectCdp({ port: 9222, fetcher: buildFetcher(), wsFactory })

    let closedCount = 0
    const ws = getWs(PAGE_WS_URL)
    ws.addEventListener("close", () => {
      closedCount++
    })

    await client.disconnect()
    expect(closedCount).toBe(1)
  })
})
