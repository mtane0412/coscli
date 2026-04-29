/**
 * store.ts — セッション ID の永続化抽象層。
 *
 * TokenStore interface を実装することで、OS keychain / ファイル / インメモリ
 * など異なるバックエンドに切り替え可能にする。
 */

/** TokenStore はセッション ID の CRUD 操作を抽象化する interface。 */
export interface TokenStore {
  /** save はプロファイル名に紐づいてセッション ID を保存する。 */
  save(profile: string, sid: string): Promise<void>
  /** load はプロファイル名に紐づいたセッション ID を返す。見つからない場合は null。 */
  load(profile: string): Promise<string | null>
  /** delete はプロファイルのセッション ID を削除する。 */
  delete(profile: string): Promise<void>
  /** list は保存済みプロファイル名の一覧を返す。 */
  list(): Promise<string[]>
}

/** InMemoryTokenStore はテスト用のインメモリ実装。 */
export class InMemoryTokenStore implements TokenStore {
  private readonly store = new Map<string, string>()

  async save(profile: string, sid: string): Promise<void> {
    this.store.set(profile, sid)
  }

  async load(profile: string): Promise<string | null> {
    return this.store.get(profile) ?? null
  }

  async delete(profile: string): Promise<void> {
    this.store.delete(profile)
  }

  async list(): Promise<string[]> {
    return [...this.store.keys()]
  }
}
