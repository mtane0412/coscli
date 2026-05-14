/**
 * auth/whoami.ts — `cos auth whoami` コマンド。
 *
 * 現在の認証ユーザー情報を取得して出力する。
 * alias: `cos me`
 *
 * セキュリティ: csrfToken は --json 出力から除外する。(issue #89)
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import { CosenseRestClient } from "@/core/api/rest"
import { loadSession } from "@/core/auth/session"
import type { TokenStore } from "@/core/auth/store"
import { createTokenStore } from "@/infra/keychain/index"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { writePlainTable } from "@/presenter/plain"
import { defineCommand } from "citty"

/** AuthWhoamiCommandDeps は createAuthWhoamiCommand に注入できる依存。テスト専用。 */
export interface AuthWhoamiCommandDeps {
  /** createStore は TokenStore を生成する関数。未指定時は OS keychain を使用する。 */
  createStore?: () => TokenStore
}

/** createAuthWhoamiCommand は依存を注入して whoami コマンドを生成する。 */
export function createAuthWhoamiCommand(deps: AuthWhoamiCommandDeps = {}) {
  const { createStore = createTokenStore } = deps

  return defineCommand({
    meta: { name: "whoami", description: "現在の認証ユーザー情報を取得する" },
    args: { ...commonArgs },
    async run({ args }) {
      const a = args as CommonArgs
      checkSandbox("auth.whoami", a)
      const logger = buildLogger(a)
      const startTime = Date.now()

      const store = createStore()
      const sid = await loadSession(store, a.profile !== undefined ? { profile: a.profile } : {})
      if (!sid) {
        writeErrorJson(
          "AUTH_REQUIRED",
          "認証情報が見つかりません",
          "`cos auth login` を実行してログインしてください",
        )
        process.exit(2)
      }

      logger.info("ユーザー情報を取得中...")

      const client = new CosenseRestClient({ sid })
      const me = await client.getMe()

      if (a.json || !a.plain) {
        // csrfToken は機密情報のため出力から除外する
        const { csrfToken: _csrfToken, ...safeMe } = me
        writeJson(safeMe, { command: "auth.whoami", startTime }, buildJsonOpts(a))
        return
      }

      writePlainTable(
        ["フィールド", "値"],
        [
          ["名前", me.name],
          ["ID", me.id],
        ],
      )
    },
  })
}

/** authWhoamiCommand は OS keychain を使うデフォルト実装。 */
export const authWhoamiCommand = createAuthWhoamiCommand()
