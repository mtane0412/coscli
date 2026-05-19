/**
 * stream.ts — /api/stream/:projectname/ レスポンスの zod スキーマ定義。
 *
 * プロジェクト全体の最近更新フィードを検証する。
 * - StreamResponseSchema: フィード全体 (pages + events)
 * - ProjectUpdatesStreamEventSchema: 7 種のプロジェクトイベント判別共用体
 */

import { PageSummarySchema } from "@/schemas/page"
import { z } from "zod"

/**
 * StreamPageSummarySchema は stream API の pages[] 要素を表す。
 *
 * /api/stream/:project/ は /api/pages/:project/ と異なり、
 * created / updated を省略することがあるため optional に緩和する。
 */
const StreamPageSummarySchema = PageSummarySchema.extend({
  created: z.number().optional(),
  updated: z.number().optional(),
})

/**
 * ProjectEventBaseSchema はすべてのプロジェクトイベントに共通するフィールド定義。
 *
 * @cosense/types の ProjectEvent interface に対応する。
 */
const ProjectEventBaseSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  userId: z.string(),
  projectId: z.string(),
  created: z.number(),
  updated: z.number(),
})

/**
 * ProjectUpdatesStreamEventSchema は /api/stream/:project/ の events 配列要素を表す。
 *
 * @cosense/types/stream-event.ts の ProjectUpdatesStreamEvent 判別共用体に対応する。
 * type フィールドで 7 種のイベントを識別する。
 */
export const ProjectUpdatesStreamEventSchema = z.discriminatedUnion("type", [
  ProjectEventBaseSchema.extend({
    type: z.literal("page.delete"),
    data: z.object({ titleLc: z.string() }),
  }),
  ProjectEventBaseSchema.extend({ type: z.literal("member.join") }),
  ProjectEventBaseSchema.extend({ type: z.literal("member.add") }),
  ProjectEventBaseSchema.extend({ type: z.literal("invitation.reset") }),
  ProjectEventBaseSchema.extend({
    type: z.literal("admin.add"),
    targetUserId: z.string(),
  }),
  ProjectEventBaseSchema.extend({
    type: z.literal("admin.delete"),
    targetUserId: z.string(),
  }),
  ProjectEventBaseSchema.extend({
    type: z.literal("owner.set"),
    targetUserId: z.string(),
  }),
])
export type ProjectUpdatesStreamEvent = z.infer<typeof ProjectUpdatesStreamEventSchema>

/**
 * StreamResponseSchema は /api/stream/:projectname/ のレスポンス全体を表す。
 *
 * @cosense/types/api/stream/project.ts の Stream interface に対応する。
 * pages は PageSummarySchema で受ける (実 API は詳細な Page 型ではなく概要形式を返すため)。
 */
export const StreamResponseSchema = z.object({
  projectName: z.string(),
  end: z.number(),
  pages: z.array(StreamPageSummarySchema),
  events: z.array(ProjectUpdatesStreamEventSchema),
})
export type StreamResponse = z.infer<typeof StreamResponseSchema>
