/**
 * auth/login.ts — `cos auth login` コマンド。
 *
 * connect.sid を対話入力、--sid フラグ、または --browser (CDP 自動取得) で受け取り、
 * /api/users/me で検証後に TokenStore に保存する。
 *
 * フラグ排他ルール:
 * - --browser と --sid は同時指定不可 (exit 5)
 * - --browser と --no-input は同時指定不可 (exit 5、ブラウザログインは対話前提)
 * - --no-input 時は --sid が必須 (exit 5)
 *
 * --browser フロー:
 * 1. Chrome/Chromium を CDP デバッグポートで起動する
 * 2. https://scrapbox.io/login を表示してユーザーにログインさせる
 * 3. connect.sid Cookie が取得できたら検証・保存して終了する
 */

import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import { CosenseRestClient } from "@/core/api/rest"
import {
  type BrowserLoginDeps,
  browserLogin as defaultBrowserLogin,
} from "@/core/auth/browser-login"
import { saveSession } from "@/core/auth/session"
import type { TokenStore } from "@/core/auth/store"
import { connectCdp } from "@/infra/browser/cdp"
import { defaultBrowserFinder } from "@/infra/browser/finder"
import { createTokenStore } from "@/infra/keychain/index"
import { defaultSpawner } from "@/infra/keychain/spawner"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** AuthLoginCommandDeps は createAuthLoginCommand に注入できる依存。テスト専用。 */
export interface AuthLoginCommandDeps {
  /**
   * browserLogin は CDP 経由でブラウザを起動して connect.sid を取得する関数。
   * テスト時はフェイクを注入して実 IO を回避する。
   */
  browserLogin?: (
    deps: BrowserLoginDeps,
    opts: { browserPath?: string; port: number; timeoutMs: number; signal?: AbortSignal },
  ) => Promise<{ sid: string }>
  /**
   * createStore は TokenStore インスタンスを返すファクトリ。
   * テスト時は InMemoryTokenStore 等を返すフェイクを注入して OS keychain を回避する。
   */
  createStore?: () => TokenStore
}

/**
 * createAuthLoginCommand は auth login コマンド定義を返すファクトリ。
 * deps を省略した場合は本番実装を使用する。
 */
export function createAuthLoginCommand(deps: AuthLoginCommandDeps = {}) {
  const browserLoginFn = deps.browserLogin ?? defaultBrowserLogin
  const storeFactory = deps.createStore ?? createTokenStore

  return defineCommand({
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
      browser: {
        type: "boolean",
        description: "ブラウザ (CDP) で connect.sid を自動取得する",
        default: false,
      },
      "browser-path": {
        type: "string",
        description: "Chrome/Chromium 実行ファイルパスを上書きする",
      },
      "browser-port": {
        type: "string",
        description: "CDP デバッグポート番号 (デフォルト: 9222)",
        default: "9222",
      },
      "browser-timeout": {
        type: "string",
        description: "cookie 取得待機タイムアウト秒数 (デフォルト: 300)",
        default: "300",
      },
    },
    async run({ args }) {
      type LoginArgs = CommonArgs & {
        sid?: string
        "no-input": boolean
        browser: boolean
        "browser-path"?: string
        "browser-port": string
        "browser-timeout": string
      }
      const a = args as LoginArgs
      checkSandbox("auth.login", a)
      const logger = buildLogger(a)
      const startTime = Date.now()
      const profile = a.profile ?? "default"

      // 排他チェック: --browser と --sid
      if (a.browser && a.sid) {
        writeErrorJson(
          "BROWSER_SID_EXCLUSIVE",
          "--browser と --sid は同時に指定できません。どちらか一方を使用してください。",
        )
        process.exit(5)
        return
      }

      // 排他チェック: --browser と --no-input
      if (a.browser && a["no-input"]) {
        writeErrorJson(
          "BROWSER_REQUIRES_INPUT",
          "--browser フラグはブラウザでの手動ログインが必要なため --no-input と併用できません。",
        )
        process.exit(5)
        return
      }

      let sid: string

      if (a.browser) {
        // ブラウザ CDP フロー
        const port = Number.parseInt(a["browser-port"], 10)
        const timeoutSec = Number.parseInt(a["browser-timeout"], 10)

        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          writeErrorJson(
            "INVALID_BROWSER_PORT",
            "--browser-port は 1..65535 の整数を指定してください",
          )
          process.exit(5)
          return
        }
        if (!Number.isInteger(timeoutSec) || timeoutSec <= 0) {
          writeErrorJson(
            "INVALID_BROWSER_TIMEOUT",
            "--browser-timeout は 1 以上の整数秒を指定してください",
          )
          process.exit(5)
          return
        }
        const timeoutMs = timeoutSec * 1_000

        logger.info("ブラウザを起動しています。Cosense にログインしてください...")

        const browserDeps: BrowserLoginDeps = {
          spawner: defaultSpawner,
          finder: defaultBrowserFinder,
          connect: connectCdp,
          fetcher: globalThis.fetch.bind(globalThis),
          wsFactory: (url) => new WebSocket(url),
          mkTmpDir: async () => {
            const dir = join(tmpdir(), `coscli-cdp-${Date.now()}`)
            await mkdir(dir, { recursive: true })
            return dir
          },
          rmTmpDir: async (path) => {
            await rm(path, { recursive: true, force: true })
          },
          now: () => Date.now(),
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        }

        const controller = new AbortController()
        const onSigInt = () => controller.abort()
        process.once("SIGINT", onSigInt)
        try {
          // exactOptionalPropertyTypes 対応: browserPath が undefined の場合は渡さない
          const loginOpts: Parameters<typeof browserLoginFn>[1] = {
            port,
            timeoutMs,
            signal: controller.signal,
          }
          if (a["browser-path"] !== undefined) loginOpts.browserPath = a["browser-path"]
          const result = await browserLoginFn(browserDeps, loginOpts)
          sid = result.sid
        } catch (err) {
          const message = (err as Error).message ?? String(err)
          if (message.includes("BROWSER_LOGIN_CANCELLED")) {
            process.exit(0)
            return
          }
          if (message.includes("BROWSER_NOT_FOUND")) {
            writeErrorJson("BROWSER_NOT_FOUND", message)
            process.exit(5)
            return
          }
          if (message.includes("BROWSER_LOGIN_TIMEOUT")) {
            writeErrorJson("BROWSER_LOGIN_TIMEOUT", message)
            process.exit(124)
            return
          }
          // BROWSER_SPAWN_FAILED / CDP_CONNECT_FAILED / その他
          writeErrorJson("BROWSER_ERROR", message)
          process.exit(1)
          return
        } finally {
          process.off("SIGINT", onSigInt)
        }
      } else if (a.sid) {
        sid = a.sid
      } else if (a["no-input"]) {
        writeErrorJson("SID_REQUIRED", "--no-input モードでは --sid フラグが必要です")
        process.exit(5)
        return
      } else {
        // 対話入力 (ヒントを表示する)
        const { password, intro, outro, isCancel } = await import("@clack/prompts")
        intro("Cosense ログイン")
        process.stderr.write(
          "ヒント: `--browser` フラグを使うと connect.sid を自動で取得できます。\n" +
            "手動で取得する場合は、ブラウザで Cosense にログイン後、\n" +
            'DevTools > Application > Cookies から "connect.sid" の値をコピーしてください。\n',
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

      const store = storeFactory()
      await saveSession(store, { profile, sid })

      logger.success(`${me.name} としてログインしました (プロファイル: ${profile})`)

      if (a.json) {
        writeJson(
          { profile, name: me.name },
          { command: "auth.login", startTime },
          buildJsonOpts(a),
        )
      }
    },
  })
}

/** authLoginCommand はデフォルト実装を使った auth login コマンド定義。 */
export const authLoginCommand = createAuthLoginCommand()
