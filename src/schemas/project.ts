/**
 * project.ts — Cosense プロジェクト関連の zod スキーマ定義。
 */

import { z } from "zod"

/** Project は /api/projects/:project のレスポンス。 */
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  publicVisible: z.boolean(),
  loginStrategies: z.array(z.string()).optional(),
  plan: z.string().optional(),
  gyazoTeamsName: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  theme: z.string().optional(),
  created: z.number(),
  updated: z.number(),
  isMember: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  trialing: z.boolean().optional(),
  trialMaxPages: z.number().optional(),
  skipConfirmation: z.boolean().optional(),
  pageCount: z.number().optional(),
  memberCount: z.number().optional(),
  invitationRotateTime: z.number().nullable().optional(),
  uploadImaages: z.number().optional(),
  uploadFiles: z.number().optional(),
})
export type Project = z.infer<typeof ProjectSchema>

/** ProjectListResponse は /api/projects のレスポンス。 */
export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSchema),
})
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>
