/**
 * auth/status.ts — `cos auth status` コマンド。
 *
 * 現在アクティブな認証情報と解決経路 (7 段優先順位のどれにヒットしたか) を表示する。
 */

import {
  type CommonArgs,
  type CredentialSource,
  buildJsonOpts,
  checkSandbox,
  commonArgs,
  resolveActiveCredentialWithSource,
} from "@/commands/_shared"
import type { CredentialStore } from "@/core/auth/credential-store"
import { TokenStoreCredentialAdapter } from "@/core/auth/credential-store"
import { createTokenStore } from "@/infra/keychain/index"
import { writeJson } from "@/presenter/json"
import { writePlainTable } from "@/presenter/plain"
import { defineCommand } from "citty"

/** AuthStatusCommandDeps は createAuthStatusCommand に注入できる依存。テスト専用。 */
export interface AuthStatusCommandDeps {
  /** createCredStore は CredentialStore を生成する関数。未指定時は OS keychain を使用する。 */
  createCredStore?: () => CredentialStore
}

/** createAuthStatusCommand は依存を注入して status コマンドを生成する。 */
export function createAuthStatusCommand(deps: AuthStatusCommandDeps = {}) {
  const getCredStore = () =>
    deps.createCredStore
      ? deps.createCredStore()
      : new TokenStoreCredentialAdapter(createTokenStore())

  return defineCommand({
    meta: { name: "status", description: "現在のアクティブ認証情報と解決経路を表示する" },
    args: { ...commonArgs },
    async run({ args }) {
      const a = args as CommonArgs
      checkSandbox("auth.status", a)
      const startTime = Date.now()

      const credStore = getCredStore()
      const { credential: cred, source } = await resolveActiveCredentialWithSource(a, credStore)

      const sourceLabel = formatSource(source)

      if (a.json || !a.plain) {
        writeJson(
          {
            kind: cred.kind,
            source,
            ...(cred.defaultProject !== undefined ? { defaultProject: cred.defaultProject } : {}),
          },
          { command: "auth.status", startTime },
          buildJsonOpts(a),
        )
        return
      }

      writePlainTable(
        ["フィールド", "値"],
        [
          ["認証種別", cred.kind],
          ["解決経路", sourceLabel],
          ...(cred.defaultProject !== undefined
            ? ([["デフォルトプロジェクト", cred.defaultProject]] as [string, string][])
            : []),
        ],
      )
    },
  })
}

/** formatSource は CredentialSource を人が読みやすい形式に変換する。 */
function formatSource(source: CredentialSource): string {
  if (source === "env:COS_PERSONAL_ACCESS_TOKEN") return "環境変数 COS_PERSONAL_ACCESS_TOKEN"
  if (source === "env:COS_SERVICE_ACCOUNT_KEY") return "環境変数 COS_SERVICE_ACCOUNT_KEY"
  if (source === "env:COS_SID") return "環境変数 COS_SID"
  // "profile:<name>" 形式
  const profileName = source.slice("profile:".length)
  return `キーチェーン プロファイル "${profileName}"`
}

/** authStatusCommand は OS keychain を使うデフォルト実装。 */
export const authStatusCommand = createAuthStatusCommand()
