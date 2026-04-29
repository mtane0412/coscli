/**
 * auth/login.ts — `cos auth login` コマンド。
 *
 * connect.sid を対話入力または --sid フラグで受け取り、
 * /api/users/me で検証後に TokenStore に保存する。
 * --no-input 時は --sid フラグが必須。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import { CosenseRestClient } from "@/core/api/rest"
import { saveSession } from "@/core/auth/session"
import { createTokenStore } from "@/infra/keychain/index"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const authLoginCommand = defineCommand({
  meta: { description: "Cosense に認証ログインする" },
  args: {
    ...commonArgs,
    sid: {
      type: "string",
      description: "connect.sid の値 (--no-input 時に使用)",
    },
    "no-input": {
      type: "boolean",
      description: "対話入力を禁止 (CI/エージェント向け)",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { sid?: string; "no-input": boolean }
    checkSandbox("auth.login", a)
    const logger = buildLogger(a)
    const startTime = Date.now()
    const profile = a.profile ?? "default"

    let sid: string
    if (a.sid) {
      sid = a.sid
    } else if (a["no-input"]) {
      writeErrorJson("SID_REQUIRED", "--no-input モードでは --sid フラグが必要です")
      process.exit(5)
    } else {
      // 対話入力
      const { password, intro, outro, isCancel } = await import("@clack/prompts")
      intro("Cosense ログイン")
      process.stderr.write(
        "ブラウザで Cosense にログイン後、DevTools > Application > Cookies から\n" +
          '"connect.sid" の値をコピーして貼り付けてください。\n',
      )
      const input = await password({ message: "connect.sid:" })
      if (isCancel(input)) {
        outro("キャンセルしました")
        process.exit(0)
      }
      sid = input as string
    }

    logger.info("認証情報を確認中...")

    const client = new CosenseRestClient({ sid })
    const me = await client.getMe()

    const store = createTokenStore()
    await saveSession(store, { profile, sid })

    logger.success(`${me.name} としてログインしました (プロファイル: ${profile})`)

    if (a.json) {
      writeJson({ profile, name: me.name }, { command: "auth.login", startTime }, buildJsonOpts(a))
    }
  },
})
