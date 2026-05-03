/**
 * subscribe.ts — Cosense WebSocket 購読の薄いラッパー。
 *
 * @cosense/std の connect()/emit()/listen()/disconnect() を ScrapboxSubscriber interface でラップし、
 * AbortSignal 連動・自動再接続・de-dupe と依存性注入 (テスト容易化) を提供する。
 *
 * 実際の WebSocket 接続は @cosense/std/websocket に委譲するため、
 * このファイルでは Socket.IO の詳細を扱わない。
 */

import type { CommitNotification, JoinRoomResponse } from "@cosense/std/websocket"
import type { ChangeToPush, DeletePageChange } from "@cosense/std/websocket"
import { createErr, createOk, isOk, unwrapErr, unwrapOk } from "option-t/plain_result"
import type { Result } from "option-t/plain_result"

/** SubscriberSocket は WebSocket 購読で使用するソケットの最小 interface。 */
export interface SubscriberSocket {
  on(event: string, listener: (...args: unknown[]) => void): void
  off(event: string, listener: (...args: unknown[]) => void): void
}

/** JoinPageRoomData は room:join で送信するページルーム参加データ。 */
export interface JoinPageRoomData {
  pageId: string
  projectId: string
  projectUpdatesStream: false
}

/** ScrapboxSubscriberStdClient は @cosense/std の WebSocket API の interface。 */
export interface ScrapboxSubscriberStdClient {
  connect(sid: string): Promise<Result<SubscriberSocket, string>>
  disconnect(socket: SubscriberSocket): Promise<Result<void, string>>
  emit(
    socket: SubscriberSocket,
    event: "room:join",
    data: JoinPageRoomData,
  ): Promise<Result<JoinRoomResponse, Error>>
  listen(
    socket: SubscriberSocket,
    event: "commit",
    listener: (event: CommitNotification) => void,
    opts?: { signal?: AbortSignal },
  ): void
}

/** PageCommitEvent は onCommit に渡すページ更新イベント。 */
export interface PageCommitEvent {
  commitId: string
  parentId: string
  pageId: string
  projectId: string
  userId: string
  changes: ChangeToPush[] | [DeletePageChange]
  /** ISO 8601 形式の受信時刻 */
  receivedAt: string
}

/** SubscribePageOptions は subscribePage に渡すオプション。 */
export interface SubscribePageOptions {
  projectId: string
  pageId: string
  /** Cosense セッション ID (connect.sid Cookie) */
  sid: string
  /** 購読を終了するための AbortSignal */
  signal: AbortSignal
}

/** ScrapboxSubscriber は Cosense ページ更新の購読を抽象化する interface。 */
export interface ScrapboxSubscriber {
  /**
   * subscribePage は指定ページの room に join し、commit イベントを購読する。
   *
   * signal が abort されるまで Promise は resolve しない。
   * abort 後は disconnect を呼んでリソースを解放する。
   */
  subscribePage(
    opts: SubscribePageOptions,
    onCommit: (event: PageCommitEvent) => void,
  ): Promise<void>
}

/** de-dupe 用の最大保持件数 */
const DEDUPE_MAX_SIZE = 64

/**
 * CosenseSubscriber は @cosense/std を使った ScrapboxSubscriber の本番実装。
 *
 * コンストラクタで stdClient を受け取ることで、テスト時にモックを注入できる。
 */
export class CosenseSubscriber implements ScrapboxSubscriber {
  constructor(private readonly stdClient: ScrapboxSubscriberStdClient) {}

  async subscribePage(
    opts: SubscribePageOptions,
    onCommit: (event: PageCommitEvent) => void,
  ): Promise<void> {
    // 1. WebSocket 接続を確立
    const connectResult = await this.stdClient.connect(opts.sid)
    if (!isOk(connectResult)) {
      throw new Error(`WebSocket 接続に失敗しました: ${unwrapErr(connectResult)}`)
    }
    const socket = unwrapOk(connectResult)

    try {
      // 2. ページルームに join
      const joinResult = await this.stdClient.emit(socket, "room:join", {
        pageId: opts.pageId,
        projectId: opts.projectId,
        projectUpdatesStream: false,
      })
      if (!isOk(joinResult)) {
        throw new Error(`room:join に失敗しました: ${unwrapErr(joinResult)}`)
      }

      // 3. de-dupe 用 Set (最大 DEDUPE_MAX_SIZE 件)
      const seenCommits = new Set<string>()

      // 4. commit イベントを購読
      this.stdClient.listen(
        socket,
        "commit",
        (event) => {
          // de-dupe: 同じ commitId は 1 度しか処理しない
          if (seenCommits.has(event.id)) return
          seenCommits.add(event.id)
          // 古いエントリを削除して Set サイズを制限
          if (seenCommits.size > DEDUPE_MAX_SIZE) {
            const oldest = seenCommits.values().next().value
            if (oldest !== undefined) seenCommits.delete(oldest)
          }

          onCommit({
            commitId: event.id,
            parentId: event.parentId,
            pageId: event.pageId,
            projectId: event.projectId,
            userId: event.userId,
            changes: event.changes,
            receivedAt: new Date().toISOString(),
          })
        },
        { signal: opts.signal },
      )

      // 5. reconnect 時に room:join を再送 (socket.io の自動再接続後は room 状態が失われる)
      // async 関数をそのまま渡すと Promise rejection が握りつぶされるため、
      // 同期ラッパーで .catch() を付けてエラーを stderr に出力する
      const handleReconnect = () => {
        void this.stdClient
          .emit(socket, "room:join", {
            pageId: opts.pageId,
            projectId: opts.projectId,
            projectUpdatesStream: false,
          })
          .catch((err: unknown) => {
            process.stderr.write(
              `[warn] WebSocket 再接続後の room:join に失敗しました: ${String(err)}\n`,
            )
          })
      }
      socket.on("reconnect", handleReconnect)

      // 6. signal が abort されるまで待機
      await new Promise<void>((resolve) => {
        if (opts.signal.aborted) {
          resolve()
          return
        }
        opts.signal.addEventListener("abort", () => resolve(), { once: true })
      })

      socket.off("reconnect", handleReconnect)
    } finally {
      // 7. 切断してリソースを解放
      await this.stdClient.disconnect(socket)
    }
  }
}

/**
 * createScrapboxSubscriber は設定に応じた ScrapboxSubscriber を返すファクトリ。
 *
 * stdClient が指定されない場合は @cosense/std を動的 import して本番実装を返す。
 */
export async function createScrapboxSubscriber(opts?: {
  stdClient?: ScrapboxSubscriberStdClient
}): Promise<ScrapboxSubscriber> {
  if (opts?.stdClient) {
    return new CosenseSubscriber(opts.stdClient)
  }

  // @cosense/std は動的 import で読み込み (バイナリサイズ最適化)
  const { connect, disconnect, listen } = await import("@cosense/std/websocket")

  const stdClient: ScrapboxSubscriberStdClient = {
    async connect(sid: string) {
      return connect(undefined, sid) as unknown as Result<SubscriberSocket, string>
    },
    async disconnect(socket: SubscriberSocket) {
      return disconnect(socket as Parameters<typeof disconnect>[0]) as unknown as Result<
        void,
        string
      >
    },
    async emit(socket: SubscriberSocket, _event: "room:join", data: JoinPageRoomData) {
      // @cosense/std は emit をエクスポートしていないため socket.io-request を直接送信する
      return new Promise<Result<JoinRoomResponse, Error>>((resolve) => {
        const s = socket as unknown as {
          emit: (
            event: string,
            req: unknown,
            cb: (
              res: { data?: JoinRoomResponse } | { error?: { name: string; message?: string } },
            ) => void,
          ) => void
        }
        s.emit("socket.io-request", { method: "room:join", data }, (res) => {
          if ("error" in res && res.error) {
            resolve(createErr(new Error(res.error.message ?? res.error.name)))
          } else if ("data" in res && res.data) {
            resolve(createOk(res.data))
          } else {
            resolve(createErr(new Error("room:join のレスポンスが不正です")))
          }
        })
      })
    },
    listen(
      socket: SubscriberSocket,
      _event: "commit",
      listener: (event: CommitNotification) => void,
      listenerOpts?: { signal?: AbortSignal },
    ) {
      listen(socket as Parameters<typeof listen>[0], "commit", listener, listenerOpts)
    },
  }

  return new CosenseSubscriber(stdClient)
}
