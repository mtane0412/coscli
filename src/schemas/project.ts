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
  // 実 API: 有料プランに未加入のプロジェクトは null を返す
  plan: z.string().nullable().optional(),
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
  uploadImages: z.number().optional(),
  uploadFiles: z.number().optional(),
})
export type Project = z.infer<typeof ProjectSchema>

/** ProjectListResponse は /api/projects のレスポンス。 */
export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectSchema),
})
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>

/**
 * FoundProjectSchema は /api/projects/search/query と /api/projects/search/watch-list
 * のレスポンス内の各プロジェクト要素。
 * @cosense/types の FoundProject interface に対応する。
 */
export const FoundProjectSchema = z.object({
  _id: z.string(),
  name: z.string(),
  displayName: z.string(),
  image: z.string().nullable().optional(),
})
export type FoundProject = z.infer<typeof FoundProjectSchema>

/**
 * ProjectSearchResultSchema は /api/projects/search/query のレスポンス全体。
 *
 * 既知フィールドのみ受理し、未知キーはストリップする（passthrough を使用しない）。
 */
export const ProjectSearchResultSchema = z.object({
  searchQuery: z.string(),
  // 認証時は object 形式、未認証または旧バージョンでは string 形式が返る場合がある
  query: z
    .union([
      z.string(),
      z.object({ words: z.array(z.string()).optional(), excludes: z.array(z.string()).optional() }),
    ])
    .optional(),
  projects: z.array(FoundProjectSchema),
})
export type ProjectSearchResult = z.infer<typeof ProjectSearchResultSchema>

/** ProjectMemberSchema は /api/projects/:project/users のレスポンス内の各メンバー要素。 */
export const ProjectMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  email: z.string().optional(),
  provider: z.string().optional(),
  created: z.number(),
  updated: z.number(),
})
export type ProjectMember = z.infer<typeof ProjectMemberSchema>

/** MemberSnapshotSchema は退去済みメンバーの記録。 */
export const MemberSnapshotSchema = z.object({
  id: z.string(),
  reason: z.string().optional(),
  created: z.number(),
  updated: z.number(),
  data: z.record(z.unknown()).optional(),
})
export type MemberSnapshot = z.infer<typeof MemberSnapshotSchema>

/** ProjectMembersResponseSchema は /api/projects/:project/users のレスポンス全体。 */
export const ProjectMembersResponseSchema = z.object({
  users: z.array(ProjectMemberSchema),
  // プロジェクトによっては返らない場合がある
  memberSnapshots: z.array(MemberSnapshotSchema).optional(),
})
export type ProjectMembersResponse = z.infer<typeof ProjectMembersResponseSchema>
