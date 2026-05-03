/**
 * subscribe.test.ts — ScrapboxSubscriber interface と CosenseSubscriber の単体テスト。
 *
 * @cosense/std の connect/emit/listen/disconnect をモック注入して、
 * WebSocket 購読フローを実際の接続なしで検証する。
 */

import { beforeEach, describe, expect, it, mock } from "bun:test"
import { CosenseSubscriber } from "@/core/api/subscribe"
import type { ScrapboxSubscriberStdClient, SubscriberSocket } from "@/core/api/subscribe"
import type { CommitNotification } from "@cosense/std/websocket"
import { createOk } from "option-t/plain_result"
import type { Result } from "option-t/plain_result"

// ----- モックソケット -----
/** createMockSocket はテスト用の最小 socket モックを生成する。 */
function createMockSocket(): SubscriberSocket & {
  triggerEvent(event: string, ...args: unknown[]): void
  listeners: Map<string, Set<(...args: unknown[]) => void>>
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  return {
    listeners,
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(listener as (...args: unknown[]) => void)
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener as (...args: unknown[]) => void)
    },
    triggerEvent(event, ...args) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args)
      }
    },
  }
}

// ----- モック stdClient -----
let mockSocket: ReturnType<typeof createMockSocket>
let capturedCommitListener: ((event: CommitNotification) => void) | null = null

const mockConnect = mock(
  async (_sid?: string) =>
    createOk(mockSocket as unknown as SubscriberSocket) as Result<SubscriberSocket, string>,
)
const mockDisconnect = mock(async (_socket: SubscriberSocket) => createOk(undefined))
const mockEmit = mock(
  async (
    _socket: SubscriberSocket,
    _event: "room:join",
    _data: { pageId: string; projectId: string; projectUpdatesStream: false },
  ) =>
    createOk({
      success: true as const,
      pageId: "テストページID",
      projectId: "テストプロジェクトID",
    }),
)
const mockListen = mock(
  (
    _socket: SubscriberSocket,
    _event: "commit",
    listener: (e: CommitNotification) => void,
    _opts?: { signal?: AbortSignal },
  ) => {
    // テスト側からリスナを呼び出せるよう保持する
    capturedCommitListener = listener
  },
)

const mockStdClient: ScrapboxSubscriberStdClient = {
  connect: mockConnect as ScrapboxSubscriberStdClient["connect"],
  disconnect: mockDisconnect as ScrapboxSubscriberStdClient["disconnect"],
  emit: mockEmit as unknown as ScrapboxSubscriberStdClient["emit"],
  listen: mockListen as unknown as ScrapboxSubscriberStdClient["listen"],
}

// ----- テスト用 CommitNotification ファクトリ -----
function makeCommitNotification(overrides: Partial<CommitNotification> = {}): CommitNotification {
  return {
    kind: "page",
    id: "コミットID-001",
    parentId: "親コミットID-001",
    pageId: "テストページID",
    projectId: "テストプロジェクトID",
    userId: "テストユーザーID",
    changes: [{ _insert: "_end", lines: { id: "行ID-001", text: "新しい行" } }],
    freeze: true,
    ...overrides,
  }
}

describe("CosenseSubscriber", () => {
  beforeEach(() => {
    mockConnect.mockClear()
    mockDisconnect.mockClear()
    mockEmit.mockClear()
    mockListen.mockClear()
    capturedCommitListener = null
    mockSocket = createMockSocket()
    // mockConnect が最新の mockSocket を返すよう再設定
    mockConnect.mockImplementation(async () => createOk(mockSocket as unknown as SubscriberSocket))
  })

  it("connect → room:join → listen → disconnect を正しい順序で呼ぶ", async () => {
    const subscriber = new CosenseSubscriber(mockStdClient)
    const ac = new AbortController()

    // subscribePage を開始して即 abort
    const promise = subscriber.subscribePage(
      {
        pageId: "テストページID",
        projectId: "テストプロジェクトID",
        sid: "テストSID",
        signal: ac.signal,
      },
      () => {},
    )
    ac.abort()
    await promise

    // 呼び出し順序の検証
    expect(mockConnect).toHaveBeenCalledTimes(1)
    expect(mockConnect).toHaveBeenCalledWith("テストSID")

    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit.mock.calls[0]?.[1]).toBe("room:join")
    expect(mockEmit.mock.calls[0]?.[2]).toEqual({
      pageId: "テストページID",
      projectId: "テストプロジェクトID",
      projectUpdatesStream: false,
    })

    expect(mockListen).toHaveBeenCalledTimes(1)
    expect(mockListen.mock.calls[0]?.[1]).toBe("commit")

    // signal が渡されていること
    expect(mockListen.mock.calls[0]?.[3]).toHaveProperty("signal")

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it("commit イベントが来ると onCommit に PageCommitEvent を渡す", async () => {
    const subscriber = new CosenseSubscriber(mockStdClient)
    const ac = new AbortController()
    const receivedEvents: unknown[] = []

    const promise = subscriber.subscribePage(
      {
        pageId: "テストページID",
        projectId: "テストプロジェクトID",
        sid: "テストSID",
        signal: ac.signal,
      },
      (event) => receivedEvents.push(event),
    )

    // connect (1回) と emit (1回) の await が完了するまでマイクロタスクを進める
    await Promise.resolve()
    await Promise.resolve()

    // commit イベントを発火 (listen が登録された後)
    const commit = makeCommitNotification()
    capturedCommitListener?.(commit)

    ac.abort()
    await promise

    expect(receivedEvents.length).toBe(1)
    const received = receivedEvents[0] as { commitId: string; userId: string; changes: unknown[] }
    expect(received.commitId).toBe("コミットID-001")
    expect(received.userId).toBe("テストユーザーID")
    expect(Array.isArray(received.changes)).toBe(true)
    // receivedAt が ISO 8601 形式であること
    expect(typeof (receivedEvents[0] as { receivedAt: string }).receivedAt).toBe("string")
  })

  it("signal が abort されると disconnect を呼んで Promise が resolve する", async () => {
    const subscriber = new CosenseSubscriber(mockStdClient)
    const ac = new AbortController()

    let resolved = false
    const promise = subscriber
      .subscribePage(
        {
          pageId: "テストページID",
          projectId: "テストプロジェクトID",
          sid: "テストSID",
          signal: ac.signal,
        },
        () => {},
      )
      .then(() => {
        resolved = true
      })

    expect(resolved).toBe(false)
    ac.abort()
    await promise

    expect(resolved).toBe(true)
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })

  it("同じ commitId のイベントは de-dupe で 2 回目以降無視する", async () => {
    const subscriber = new CosenseSubscriber(mockStdClient)
    const ac = new AbortController()
    const receivedEvents: unknown[] = []

    const promise = subscriber.subscribePage(
      {
        pageId: "テストページID",
        projectId: "テストプロジェクトID",
        sid: "テストSID",
        signal: ac.signal,
      },
      (event) => receivedEvents.push(event),
    )

    // connect と emit の await が完了するまで待つ
    await Promise.resolve()
    await Promise.resolve()

    const commit = makeCommitNotification({ id: "重複コミットID" })
    capturedCommitListener?.(commit)
    capturedCommitListener?.(commit) // 同じコミットを再度送信
    capturedCommitListener?.(commit) // さらに再送

    ac.abort()
    await promise

    // de-dupe により 1 回しか処理されないこと
    expect(receivedEvents.length).toBe(1)
  })

  it("reconnect イベント発火時に room:join を再送する", async () => {
    const subscriber = new CosenseSubscriber(mockStdClient)
    const ac = new AbortController()

    const promise = subscriber.subscribePage(
      {
        pageId: "テストページID",
        projectId: "テストプロジェクトID",
        sid: "テストSID",
        signal: ac.signal,
      },
      () => {},
    )

    // connect と emit の await が完了するまで待つ
    await Promise.resolve()
    await Promise.resolve()

    // 初回 emit を確認してからリセット
    expect(mockEmit).toHaveBeenCalledTimes(1)
    mockEmit.mockClear()

    // reconnect をシミュレート
    mockSocket.triggerEvent("reconnect")

    // reconnect 後に room:join を再送していること (非同期なので await)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit.mock.calls[0]?.[1]).toBe("room:join")

    ac.abort()
    await promise
  })

  it("connect が失敗した場合はエラーを throw する", async () => {
    const { createErr } = await import("option-t/plain_result")
    mockConnect.mockImplementationOnce(
      async () => createErr("io server disconnect") as Result<SubscriberSocket, string>,
    )

    const subscriber = new CosenseSubscriber(mockStdClient)
    const ac = new AbortController()

    await expect(
      subscriber.subscribePage(
        {
          pageId: "テストページID",
          projectId: "テストプロジェクトID",
          sid: "テストSID",
          signal: ac.signal,
        },
        () => {},
      ),
    ).rejects.toThrow()
  })
})
