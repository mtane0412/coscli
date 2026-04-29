/**
 * session.ts — connect.sid セッションの取得・保存ユースケース。
 *
 * TokenStore を通じてプロファイル別に connect.sid を管理する。
 * プロファイル未指定時は "default" を使用する。
 */

import type { TokenStore } from "@/core/auth/store"

const DEFAULT_PROFILE = "default"

/** saveSession は connect.sid を TokenStore に保存する。 */
export async function saveSession(
  store: TokenStore,
  opts: { profile?: string; sid: string },
): Promise<void> {
  const profile = opts.profile ?? DEFAULT_PROFILE
  await store.save(profile, opts.sid)
}

/** loadSession は TokenStore から connect.sid を取得する。 */
export async function loadSession(
  store: TokenStore,
  opts: { profile?: string },
): Promise<string | undefined> {
  const profile = opts.profile ?? DEFAULT_PROFILE
  const token = await store.load(profile)
  return token ?? undefined
}

/** deleteSession は TokenStore から connect.sid を削除する。 */
export async function deleteSession(store: TokenStore, opts: { profile?: string }): Promise<void> {
  const profile = opts.profile ?? DEFAULT_PROFILE
  await store.delete(profile)
}
