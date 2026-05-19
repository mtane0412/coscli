/**
 * snapshot.ts — Scrapbox page-snapshots API レスポンスの zod スキーマ定義。
 *
 * - GET /api/page-snapshots/:project/:pageId            → PageSnapshotList
 * - GET /api/page-snapshots/:project/:pageId/:timestampId → PageSnapshotResult
 */

import { LineSchema } from "@/schemas/page"
import { z } from "zod"

/** SnapshotTimestamp はスナップショットのタイムスタンプ 1 件を表す。 */
export const SnapshotTimestampSchema = z.object({
  id: z.string(),
  created: z.number(),
})
export type SnapshotTimestamp = z.infer<typeof SnapshotTimestampSchema>

/** PageSnapshotList は /api/page-snapshots/:project/:pageId のレスポンス全体。 */
export const PageSnapshotListSchema = z.object({
  pageId: z.string(),
  timestamps: z.array(SnapshotTimestampSchema),
})
export type PageSnapshotList = z.infer<typeof PageSnapshotListSchema>

/**
 * SnapshotSchema は特定時点のページコンテンツ (タイトル・行) を表す。
 *
 * lines は BaseLine 相当であり既存 LineSchema を再利用する。
 */
export const SnapshotSchema = z.object({
  title: z.string(),
  created: z.number(),
  lines: z.array(LineSchema),
})
export type Snapshot = z.infer<typeof SnapshotSchema>

/**
 * PageSnapshotResult は /api/page-snapshots/:project/:pageId/:timestampId のレスポンス全体。
 *
 * page はスナップショット取得時点のページメタ情報。
 * BasePage の各フィールドは API によって欠落する場合があるため省略可能とする。
 */
export const PageSnapshotResultSchema = z.object({
  page: z.object({
    id: z.string(),
    title: z.string(),
    commitId: z.string().optional(),
    image: z.string().nullable().optional(),
    descriptions: z.array(z.string()).optional(),
    pin: z.number().optional(),
    created: z.number(),
    updated: z.number(),
    accessed: z.number().optional(),
    snapshotCreated: z.number().nullable().optional(),
    views: z.number().optional(),
    linked: z.number().optional(),
    pageRank: z.number().optional(),
    user: z.object({ id: z.string() }),
    lastupdateUser: z.object({ id: z.string() }).nullable(),
  }),
  snapshot: SnapshotSchema,
})
export type PageSnapshotResult = z.infer<typeof PageSnapshotResultSchema>
