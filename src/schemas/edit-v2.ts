/**
 * edit-v2.ts — Cosense v2 ページ編集 AI エンドポイントの zod スキーマ定義。
 *
 * /api/pages/v2/:project/page-edit-for-ai/preview および submit の
 * リクエスト・レスポンスを型安全に扱う。
 */

import { z } from "zod"

// ─── リクエスト内部フォーマット (changes) ───────────────────────────────

/**
 * RawInsertChangeSchema は insertBefore op を変換した内部 change 形式。
 *
 * `_insert` はアンカー行 ID（挿入先の直前行 ID または "_end"）。
 * `lines.id` は新規生成されたランダム行 ID。
 */
export const RawInsertChangeSchema = z.object({
  _insert: z.string(),
  lines: z.object({ id: z.string(), text: z.string() }),
})
export type RawInsertChange = z.infer<typeof RawInsertChangeSchema>

/** RawUpdateChangeSchema は replace op を変換した内部 change 形式。 */
export const RawUpdateChangeSchema = z.object({
  _update: z.string(),
  lines: z.object({ text: z.string() }),
})
export type RawUpdateChange = z.infer<typeof RawUpdateChangeSchema>

/** RawDeleteChangeSchema は delete op を変換した内部 change 形式。 */
export const RawDeleteChangeSchema = z.object({
  _delete: z.string(),
})
export type RawDeleteChange = z.infer<typeof RawDeleteChangeSchema>

/** RawChangeSchema は API に送信する内部 change の Union 型スキーマ。 */
export const RawChangeSchema = z.union([
  RawInsertChangeSchema,
  RawUpdateChangeSchema,
  RawDeleteChangeSchema,
])
export type RawChange = z.infer<typeof RawChangeSchema>

// ─── ユーザー向け ops フォーマット ────────────────────────────────────────

/**
 * InsertBeforeOpSchema は insertBefore 操作のスキーマ。
 *
 * `.strict()` で余分なキーを拒否し、複数操作キーの同時指定による曖昧な入力を防ぐ。
 */
export const InsertBeforeOpSchema = z
  .object({ insertBefore: z.string(), text: z.string() })
  .strict()
export type InsertBeforeOp = z.infer<typeof InsertBeforeOpSchema>

/** ReplaceOpSchema は replace 操作のスキーマ。`.strict()` で余分なキーを拒否する。 */
export const ReplaceOpSchema = z.object({ replace: z.string(), text: z.string() }).strict()
export type ReplaceOp = z.infer<typeof ReplaceOpSchema>

/** DeleteOpSchema は delete 操作のスキーマ。`.strict()` で余分なキーを拒否する。 */
export const DeleteOpSchema = z.object({ delete: z.string() }).strict()
export type DeleteOp = z.infer<typeof DeleteOpSchema>

/** OpSchema はユーザー向け ops フォーマットの Union 型スキーマ。 */
export const OpSchema = z.union([InsertBeforeOpSchema, ReplaceOpSchema, DeleteOpSchema])
export type Op = z.infer<typeof OpSchema>

/** OpsInputSchema は stdin/ファイルから受け取る ops JSON のルートスキーマ。 */
export const OpsInputSchema = z.object({
  ops: z.array(OpSchema),
})
export type OpsInput = z.infer<typeof OpsInputSchema>

// ─── レスポンス ───────────────────────────────────────────────────────────

/** PreviewLineSchema は previewEdit レスポンス内の行情報スキーマ。 */
export const PreviewLineSchema = z.object({
  id: z.string(),
  text: z.string(),
})
export type PreviewLine = z.infer<typeof PreviewLineSchema>

/**
 * PagePreviewSchema は previewEdit レスポンス内の pagePreview フィールド。
 *
 * `persistent === false` の場合は新規ページ作成 (status: "create")。
 * null の場合は pagePreview が取得できなかった（稀なケース）。
 */
export const PagePreviewSchema = z
  .object({
    title: z.string().optional(),
    persistent: z.boolean().optional(),
    lines: z.array(PreviewLineSchema).optional(),
  })
  .nullable()
export type PagePreview = z.infer<typeof PagePreviewSchema>

/** PreviewResponseSchema は /api/pages/v2/:project/page-edit-for-ai/preview のレスポンス。 */
export const PreviewResponseSchema = z.object({
  previewId: z.string(),
  expireAt: z.string(),
  pagePreview: PagePreviewSchema,
})
export type PreviewResponse = z.infer<typeof PreviewResponseSchema>

/** SubmitResponseSchema は /api/pages/v2/:project/page-edit-for-ai/submit のレスポンス。 */
export const SubmitResponseSchema = z.object({
  commitId: z.string(),
  page: z
    .object({
      title: z.string().optional(),
    })
    .nullable(),
})
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>
