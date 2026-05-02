/**
 * engine.ts — sync pull/push/diff の純粋なドメインロジック。
 *
 * REST クライアントと ScrapboxWriter を DI で受け取ることで、
 * テスト時にモックを注入できる。ファイルシステムへの依存は local.ts に委譲する。
 */

import type { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import { computeDiff } from "@/core/sync/diff"
import type { DiffResult } from "@/core/sync/diff"
import { safeFsName } from "@/core/sync/fsname"
import { contentToString, readLocalContent, sha256, writeLocalContent } from "@/core/sync/local"
import { readMeta, writeMeta } from "@/core/sync/meta"
import type { SyncMeta } from "@/core/sync/meta"

/** SyncPullOptions は syncPull のオプション。 */
export interface SyncPullOptions {
  dryRun?: boolean
  format?: "txt"
}

/** SyncPullResult は syncPull の結果。 */
export interface SyncPullResult {
  title: string
  commitId: string
  /** タイトル行を除いた本文行配列 */
  lines: string[]
  dryRun?: boolean
}

/**
 * syncPull は Cosense からページを取得してローカルに保存する。
 *
 * lines[0] はタイトル行なので除外する。
 * メタファイルに commitId と contentSha256 を記録する。
 */
export async function syncPull(
  client: CosenseRestClient,
  syncDir: string,
  project: string,
  title: string,
  opts: SyncPullOptions = {},
): Promise<SyncPullResult> {
  const format = opts.format ?? "txt"
  // タイトルのファイル名バリデーション (NG なら FilenameInvalidError を throw)
  safeFsName(title)

  const page = await client.getPage(project, title)
  // lines[0] はタイトル行なので除外して本文だけ取り出す
  const bodyLines = page.lines.slice(1).map((l) => l.text)

  if (opts.dryRun) {
    return { title, commitId: page.commitId, lines: bodyLines, dryRun: true }
  }

  writeLocalContent(syncDir, title, format, bodyLines)

  const contentStr = contentToString(bodyLines)
  const meta: SyncMeta = {
    schemaVersion: 1,
    project,
    title,
    pageId: page.id,
    commitId: page.commitId,
    lastPulledAt: Date.now(),
    format,
    contentSha256: sha256(contentStr),
  }
  writeMeta(syncDir, meta)

  return { title, commitId: page.commitId, lines: bodyLines }
}

/** SyncPushOptions は syncPush のオプション。 */
export interface SyncPushOptions {
  dryRun?: boolean
  retries?: number
}

/** SyncPushResult は syncPush の結果。 */
export interface SyncPushResult {
  committed: boolean
  status?: "in-sync"
  newCommitId?: string
  dryRun?: boolean
  errorCode?: "META_REQUIRED" | "LOCAL_NOT_FOUND" | "CONFLICT"
  localCommitId?: string
  serverCommitId?: string
}

/**
 * syncPush はローカルファイルの内容を Cosense に push する。
 *
 * commitId の一致チェックで楽観ロック競合を検出する。
 * --retries N 指定時、ローカル未編集であれば自動 pull → push を試みる。
 */
export async function syncPush(
  client: CosenseRestClient,
  writer: ScrapboxWriter,
  syncDir: string,
  project: string,
  title: string,
  opts: SyncPushOptions = {},
): Promise<SyncPushResult> {
  const format = "txt" as const
  safeFsName(title)

  const meta = readMeta(syncDir, project, title)
  if (meta === null) {
    return { committed: false, errorCode: "META_REQUIRED" }
  }

  const localLines = readLocalContent(syncDir, title, format)
  if (localLines === null) {
    return { committed: false, errorCode: "LOCAL_NOT_FOUND" }
  }

  const maxRetries = opts.retries ?? 0
  let remainingRetries = maxRetries

  while (true) {
    const serverPage = await client.getPage(project, title)

    if (meta.commitId !== serverPage.commitId) {
      // commitId 不一致 = 競合
      const localContentStr = contentToString(localLines)
      const localUnchanged = sha256(localContentStr) === meta.contentSha256

      if (localUnchanged && remainingRetries > 0) {
        // ローカル未編集かつリトライ残あり → 自動 re-pull してから push
        remainingRetries--
        await syncPull(client, syncDir, project, title)
        // pull 後メタが更新されたので再取得してループ継続
        const updatedMeta = readMeta(syncDir, project, title)
        if (updatedMeta) {
          // コミット ID を更新してから続きに進む
          // meta は const なので新しいメタで上書きして in-sync チェックへ
          const rePushResult = await syncPush(client, writer, syncDir, project, title, {
            ...opts,
            retries: remainingRetries,
          })
          return rePushResult
        }
      }

      return {
        committed: false,
        errorCode: "CONFLICT",
        localCommitId: meta.commitId,
        serverCommitId: serverPage.commitId,
      }
    }

    // in-sync チェック: ローカルと最新 pull 後が同じなら push 不要
    const serverBodyLines = serverPage.lines.slice(1).map((l) => l.text)
    const diffResult = computeDiff(localLines, serverBodyLines)
    if (diffResult.status === "in-sync") {
      return { committed: false, status: "in-sync" }
    }

    if (opts.dryRun) {
      return { committed: false, dryRun: true }
    }

    // push 実行
    const patchResult = await writer.patch({
      project,
      title,
      update: () => [title, ...localLines],
    })

    if ("dryRun" in patchResult) {
      return { committed: false, dryRun: true }
    }

    const newCommitId = patchResult.commitId

    // メタを更新
    const localContentStr = contentToString(localLines)
    const updatedMeta: SyncMeta = {
      ...meta,
      commitId: newCommitId,
      lastPulledAt: Date.now(),
      contentSha256: sha256(localContentStr),
    }
    writeMeta(syncDir, updatedMeta)

    return { committed: true, newCommitId }
  }
}

/** SyncDiffStatus は syncDiff で返す同期状態。 */
export type SyncDiffStatus = "in-sync" | "modified" | "remote-only" | "local-only"

/** SyncDiffResult は syncDiff の結果。 */
export interface SyncDiffResult {
  project: string
  title: string
  status: SyncDiffStatus
  local: { commitId?: string; sha256: string; lineCount: number } | null
  remote: { commitId: string; lineCount: number } | null
  diff: DiffResult
}

/**
 * syncDiff はローカルファイルとリモートページの差分を計算する。
 */
export async function syncDiff(
  client: CosenseRestClient,
  syncDir: string,
  project: string,
  title: string,
): Promise<SyncDiffResult> {
  const format = "txt" as const
  safeFsName(title)

  const serverPage = await client.getPage(project, title)
  const serverBodyLines = serverPage.lines.slice(1).map((l) => l.text)

  const localLines = readLocalContent(syncDir, title, format)
  const meta = readMeta(syncDir, project, title)

  if (localLines === null) {
    // ローカルファイルが存在しない = リモートのみ
    return {
      project,
      title,
      status: "remote-only",
      local: null,
      remote: { commitId: serverPage.commitId, lineCount: serverBodyLines.length },
      diff: computeDiff([], serverBodyLines),
    }
  }

  if (serverBodyLines.length === 0 && localLines.length > 0) {
    // リモートが空でローカルにある = ローカルのみ
    const localContentStr = contentToString(localLines)
    const localInfo: { commitId?: string; sha256: string; lineCount: number } = {
      sha256: sha256(localContentStr),
      lineCount: localLines.length,
    }
    if (meta?.commitId !== undefined) localInfo.commitId = meta.commitId
    return {
      project,
      title,
      status: "local-only",
      local: localInfo,
      remote: { commitId: serverPage.commitId, lineCount: 0 },
      diff: computeDiff(localLines, []),
    }
  }

  const diffResult = computeDiff(localLines, serverBodyLines)
  const localContentStr = contentToString(localLines)
  const status: SyncDiffStatus = diffResult.status === "in-sync" ? "in-sync" : "modified"

  const localInfo: { commitId?: string; sha256: string; lineCount: number } = {
    sha256: sha256(localContentStr),
    lineCount: localLines.length,
  }
  if (meta?.commitId !== undefined) localInfo.commitId = meta.commitId

  return {
    project,
    title,
    status,
    local: localInfo,
    remote: { commitId: serverPage.commitId, lineCount: serverBodyLines.length },
    diff: diffResult,
  }
}
