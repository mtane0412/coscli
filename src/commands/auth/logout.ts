/**
 * auth/logout.ts — `cos auth logout` コマンド。
 *
 * 指定したプロファイルの connect.sid を TokenStore から削除する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import { deleteSession } from "@/core/auth/session"
import { createTokenStore } from "@/infra/keychain/index"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const authLogoutCommand = defineCommand({
  meta: { name: "logout", description: "認証情報を削除する" },
  args: { ...commonArgs },
  async run({ args }) {
    const a = args as CommonArgs
    checkSandbox("auth.logout", a)
    const logger = buildLogger(a)
    const profile = a.profile ?? "default"
    const startTime = Date.now()

    const store = createTokenStore()
    await deleteSession(store, { profile })

    logger.success(`プロファイル "${profile}" からログアウトしました`)

    if (a.json) {
      writeJson(
        { profile, loggedOut: true },
        { command: "auth.logout", startTime },
        buildJsonOpts(a),
      )
    }
  },
})
