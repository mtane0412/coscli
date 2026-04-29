/**
 * user.ts — Cosense ユーザー関連の zod スキーマ定義。
 */

import { z } from "zod"

/** Me は /api/users/me のレスポンス。 */
export const MeSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  email: z.string().optional(),
  photo: z.string().optional(),
  csrfToken: z.string(),
  isPasswordUser: z.boolean().optional(),
  isGitHubUser: z.boolean().optional(),
  config: z
    .object({
      userScript: z.boolean().optional(),
      theme: z.string().optional(),
    })
    .optional(),
})
export type Me = z.infer<typeof MeSchema>
