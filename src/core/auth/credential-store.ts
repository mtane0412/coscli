/**
 * credential-store.ts — Credential の永続化抽象層。
 *
 * TokenStore を内部バックエンドとして使い、Credential 型で CRUD できる CredentialStore を提供する。
 * keychain の値は JSON エンベロープ形式 {"kind":"sid"|"pat"|"sa","value":"...","defaultProject"?:"..."} で保存し、
 * 旧バージョンの平文 SID/PAT 値は legacy 互換として自動解釈する。
 */

import { type Credential, type CredentialKind, detectCredentialKind } from "@/core/auth/credential"
import type { TokenStore } from "@/core/auth/store"

/** CredentialListEntry は list() が返すプロファイルの要約エントリ。 */
export interface CredentialListEntry {
  profile: string
  kind: CredentialKind
  defaultProject?: string
}

/** CredentialStore は Credential の CRUD 操作を抽象化する interface。 */
export interface CredentialStore {
  /** save はプロファイル名に紐づいて Credential を保存する。 */
  save(profile: string, cred: Credential): Promise<void>
  /** load はプロファイル名に紐づいた Credential を返す。見つからない場合は null。 */
  load(profile: string): Promise<Credential | null>
  /** delete はプロファイルの Credential を削除する。 */
  delete(profile: string): Promise<void>
  /** list は保存済みプロファイルの一覧を kind/defaultProject 付きで返す。 */
  list(): Promise<CredentialListEntry[]>
}

/** CredentialEnvelope は keychain に JSON で保存する内部形式。 */
interface CredentialEnvelope {
  kind: CredentialKind
  value: string
  defaultProject?: string
}

/**
 * serializeCredential は Credential を JSON エンベロープ文字列に変換する。
 */
function serializeCredential(cred: Credential): string {
  const env: CredentialEnvelope = { kind: cred.kind, value: cred.value }
  if (cred.defaultProject !== undefined) env.defaultProject = cred.defaultProject
  return JSON.stringify(env)
}

/**
 * deserializeCredential は JSON エンベロープ文字列または legacy 平文値を Credential に変換する。
 *
 * JSON エンベロープを優先し、パース失敗時は legacy 平文として detectCredentialKind で種別判定する。
 * SA Key の legacy 平文値は defaultProject が不明なため null を返す。
 */
function deserializeCredential(raw: string): Credential | null {
  // JSON エンベロープ形式の判定: {"kind": で始まるかどうかで区別
  if (raw.startsWith('{"kind":')) {
    try {
      const env = JSON.parse(raw) as unknown
      if (
        typeof env === "object" &&
        env !== null &&
        "kind" in env &&
        "value" in env &&
        typeof (env as CredentialEnvelope).kind === "string" &&
        typeof (env as CredentialEnvelope).value === "string"
      ) {
        const envelope = env as CredentialEnvelope
        if (envelope.kind === "sa") {
          if (!envelope.defaultProject) return null
          return { kind: "sa", value: envelope.value, defaultProject: envelope.defaultProject }
        }
        const cred: Credential =
          envelope.kind === "pat"
            ? { kind: "pat", value: envelope.value }
            : { kind: "sid", value: envelope.value }
        if (envelope.defaultProject !== undefined) {
          ;(cred as { defaultProject?: string }).defaultProject = envelope.defaultProject
        }
        return cred
      }
    } catch {
      // JSON パース失敗時は legacy 平文として扱う
    }
  }

  // legacy 平文値: pat_/cs_ プレフィックスで種別判定
  const kind = detectCredentialKind(raw)
  if (kind === "pat") return { kind: "pat", value: raw }
  if (kind === "sid") return { kind: "sid", value: raw }
  // SA Key の legacy 平文値は defaultProject が不明なため null
  return null
}

/**
 * TokenStoreCredentialAdapter は既存の TokenStore を使って CredentialStore を実装するアダプタ。
 *
 * keychain への実際の永続化は TokenStore に委譲する。
 */
export class TokenStoreCredentialAdapter implements CredentialStore {
  constructor(private readonly tokenStore: TokenStore) {}

  async save(profile: string, cred: Credential): Promise<void> {
    await this.tokenStore.save(profile, serializeCredential(cred))
  }

  async load(profile: string): Promise<Credential | null> {
    const raw = await this.tokenStore.load(profile)
    if (raw === null) return null
    return deserializeCredential(raw)
  }

  async delete(profile: string): Promise<void> {
    await this.tokenStore.delete(profile)
  }

  async list(): Promise<CredentialListEntry[]> {
    const profiles = await this.tokenStore.list()
    const entries: CredentialListEntry[] = []
    for (const profile of profiles) {
      const cred = await this.load(profile)
      if (cred === null) continue
      const entry: CredentialListEntry = { profile, kind: cred.kind }
      if (cred.defaultProject !== undefined) entry.defaultProject = cred.defaultProject
      entries.push(entry)
    }
    return entries
  }
}

/** InMemoryCredentialStore はテスト用のインメモリ実装。 */
export class InMemoryCredentialStore implements CredentialStore {
  private readonly store = new Map<string, Credential>()

  async save(profile: string, cred: Credential): Promise<void> {
    this.store.set(profile, cred)
  }

  async load(profile: string): Promise<Credential | null> {
    return this.store.get(profile) ?? null
  }

  async delete(profile: string): Promise<void> {
    this.store.delete(profile)
  }

  async list(): Promise<CredentialListEntry[]> {
    const entries: CredentialListEntry[] = []
    for (const [profile, cred] of this.store) {
      const entry: CredentialListEntry = { profile, kind: cred.kind }
      if (cred.defaultProject !== undefined) entry.defaultProject = cred.defaultProject
      entries.push(entry)
    }
    return entries
  }
}
