/**
 * commit.ts — Scrapbox commits API レスポンスの zod スキーマ定義。
 *
 * GET /api/commits/:project/:pageid のレスポンスを検証する。
 * changes フィールドはバリエーションが多いため汎用レコードで素通しする。
 */

import { z } from "zod"

/**
 * commitSchema は 1 件のコミットを表すスキーマ。
 *
 * parentId は最初のコミットでは存在しないため省略可能とする。
 * changes は変更種別のユニオンが 15 種類超あるため汎用レコードで素通しする。
 */
export const commitSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  pageId: z.string(),
  userId: z.string(),
  created: z.number(),
  kind: z.literal("page"),
  changes: z.array(z.record(z.unknown())).default([]),
})

/** commitsResponseSchema は commits API のレスポンス全体のスキーマ。 */
export const commitsResponseSchema = z.object({
  commits: z.array(commitSchema),
})

/** Commit は 1 件のコミットの型。 */
export type Commit = z.infer<typeof commitSchema>

/** CommitsResponse は commits API のレスポンス全体の型。 */
export type CommitsResponse = z.infer<typeof commitsResponseSchema>
