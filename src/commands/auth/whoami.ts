/**
 * auth/whoami.ts — `cos auth whoami` コマンド。
 *
 * 現在の認証ユーザー情報を取得して出力する。
 * alias: `cos me`
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
import { createTokenStore } from "@/infra/keychain/index"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { writePlainTable } from "@/presenter/plain"
import { defineCommand } from "citty"

export const authWhoamiCommand = defineCommand({
  meta: { description: "現在の認証ユーザー情報を取得する" },
  args: { ...commonArgs },
  async run({ args }) {
    const a = args as CommonArgs
    checkSandbox("auth.whoami", a)
    const logger = buildLogger(a)
    const startTime = Date.now()

    const store = createTokenStore()
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
      writeJson(me, { command: "auth.whoami", startTime }, buildJsonOpts(a))
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
