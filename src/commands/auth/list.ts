/**
 * auth/list.ts — `cos auth list` コマンド。
 *
 * keychain に登録された全プロファイルを kind・defaultProject 付きで一覧表示する。
 * alias: `cos auth ls`
 */

import { type CommonArgs, buildJsonOpts, checkSandbox, commonArgs } from "@/commands/_shared"
import type { CredentialStore } from "@/core/auth/credential-store"
import { TokenStoreCredentialAdapter } from "@/core/auth/credential-store"
import { createTokenStore } from "@/infra/keychain/index"
import { writeJson } from "@/presenter/json"
import { writePlainTable } from "@/presenter/plain"
import { defineCommand } from "citty"

/** AuthListCommandDeps は createAuthListCommand に注入できる依存。テスト専用。 */
export interface AuthListCommandDeps {
  /** createCredStore は CredentialStore を生成する関数。未指定時は OS keychain を使用する。 */
  createCredStore?: () => CredentialStore
}

/** createAuthListCommand は依存を注入して list コマンドを生成する。 */
export function createAuthListCommand(deps: AuthListCommandDeps = {}) {
  const getCredStore = () =>
    deps.createCredStore
      ? deps.createCredStore()
      : new TokenStoreCredentialAdapter(createTokenStore())

  return defineCommand({
    meta: { name: "list", description: "登録済み認証プロファイルを一覧表示する" },
    args: { ...commonArgs },
    async run({ args }) {
      const a = args as CommonArgs
      checkSandbox("auth.list", a)
      const startTime = Date.now()

      const credStore = getCredStore()
      const entries = await credStore.list()

      if (a.json || !a.plain) {
        const profiles = entries.map((e) => ({
          profile: e.profile,
          kind: e.kind,
          ...(e.defaultProject !== undefined ? { defaultProject: e.defaultProject } : {}),
        }))
        writeJson({ profiles }, { command: "auth.list", startTime }, buildJsonOpts(a))
        return
      }

      if (entries.length === 0) {
        process.stdout.write("登録済みのプロファイルはありません\n")
        return
      }

      writePlainTable(
        ["プロファイル", "kind", "defaultProject"],
        entries.map((e) => [e.profile, e.kind, e.defaultProject ?? ""]),
      )
    },
  })
}

/** authListCommand は OS keychain を使うデフォルト実装。 */
export const authListCommand = createAuthListCommand()
