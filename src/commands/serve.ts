/**
 * serve.ts — `cos serve --rest` コマンド。
 *
 * CSRF トークン取得・セッション認証を隠蔽したローカル HTTP プロキシを起動する。
 * AI エージェントや外部ツールが Cosense API を curl/fetch で操作できるようにする。
 * Bun.serve() を使い追加依存ゼロ。Ctrl+C (SIGINT/SIGTERM) で graceful shutdown。
 */

import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
  dryRunArg,
  requireProject,
  requireSid,
} from "@/commands/_shared"
import { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import { createScrapboxWriter } from "@/core/api/ws"
import { createPolicy } from "@/core/sandbox"
import { resolvePolicy } from "@/core/sandbox/resolve"
import { createFetchHandler } from "@/core/server/rest"
import type { ServerContext } from "@/core/server/types"
import { loadConfig } from "@/infra/config"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/**
 * ServeDeps は makeServeCommand に渡す依存オブジェクト。
 *
 * テスト時にモックを注入できるようにするための DI interface。
 * startServer は signal を受け取り、abort されたら resolve する。
 */
export interface ServeDeps {
  /** セッション ID 取得関数 (省略時: requireSid) */
  getSid?: (profile?: string) => Promise<string>
  /** ScrapboxWriter 生成関数 (省略時: createScrapboxWriter) */
  createWriter?: (sid: string, dryRun: boolean) => Promise<ScrapboxWriter>
  /** HTTP サーバ起動関数 (省略時: 実際の Bun.serve)。signal が abort されたら resolve すること。 */
  startServer?: (
    ctx: ServerContext,
    opts: { port: number; hostname: string; signal: AbortSignal },
  ) => Promise<void>
}

/** DEFAULT_PORT はデフォルトリッスンポート。 */
const DEFAULT_PORT = 8080
/** DEFAULT_HOST はデフォルトリッスンホスト。外部公開防止のためループバックに限定。 */
const DEFAULT_HOST = "127.0.0.1"
/** PORT_MIN/MAX は許容ポート範囲。 */
const PORT_MIN = 1
const PORT_MAX = 65535

/**
 * makeServeCommand は ServeDeps を受け取り、citty コマンドを返すファクトリ。
 * deps を省略すると本番実装 (実際の Bun.serve 起動) を使用する。
 * テスト時は deps にモックを渡してフローを検証する。
 */
export function makeServeCommand(deps: ServeDeps = {}) {
  const getSidFn = deps.getSid ?? requireSid
  const createWriterFn =
    deps.createWriter ?? ((sid, dryRun) => createScrapboxWriter({ sid, dryRun }))
  const startServerFn = deps.startServer ?? startBunServer

  return defineCommand({
    meta: { name: "serve", description: "ローカル REST プロキシサーバーを起動する" },
    args: {
      ...commonArgs,
      ...dryRunArg,
      rest: {
        type: "boolean" as const,
        description: "REST プロキシモードで起動する",
        default: false,
      },
      port: {
        type: "string" as const,
        description: `リッスンポート (デフォルト: ${DEFAULT_PORT})`,
        default: String(DEFAULT_PORT),
      },
      host: {
        type: "string" as const,
        description: `リッスンホスト (デフォルト: ${DEFAULT_HOST})`,
        default: DEFAULT_HOST,
      },
      token: {
        type: "string" as const,
        description: "プロキシ Bearer 認証トークン (設定時のみ要求)",
      },
      "allow-write": {
        type: "boolean" as const,
        description: "POST/PUT/DELETE (書き込み系) エンドポイントを有効化する",
        default: false,
      },
    },

    async run({ args }) {
      const a = args as WriteCommonArgs & {
        rest: boolean
        port: string
        host: string
        token?: string
        "allow-write": boolean
      }
      const logger = buildLogger(a)
      const startTime = Date.now()

      // 1. --rest 必須チェック
      if (!a.rest) {
        writeErrorJson(
          "MODE_REQUIRED",
          "--rest フラグを指定してください",
          "--rest を付けて再実行してください",
        )
        process.exit(5)
        return
      }

      // 2. --port バリデーション（先頭数値のみ通す parseInt を避け、厳密な整数文字列を検証する）
      const isIntegerString = /^\d+$/.test(a.port)
      const portNum = Number(a.port)
      if (
        !isIntegerString ||
        !Number.isInteger(portNum) ||
        portNum < PORT_MIN ||
        portNum > PORT_MAX
      ) {
        writeErrorJson(
          "INVALID_PORT",
          `--port の値が無効です: ${a.port}`,
          `${PORT_MIN}〜${PORT_MAX} の整数を指定してください`,
        )
        process.exit(5)
        return
      }

      // 3. sandbox チェック（プロジェクト取得より前）
      checkSandbox("serve.rest", a)

      // 4. --project 必須チェック
      const project = requireProject(a)

      // 5. 認証
      const sid = await getSidFn(a.profile)

      // 6. --host 非ループバック時の --token 必須チェック
      const LOOPBACK_HOSTS = ["127.0.0.1", "::1", "localhost"]
      const hostLower = (a.host ?? DEFAULT_HOST).toLowerCase()
      const isLoopback = LOOPBACK_HOSTS.includes(hostLower)
      if (!isLoopback && !a.token) {
        writeErrorJson(
          "TOKEN_REQUIRED",
          "--host に非ループバックアドレスを指定する場合は --token が必須です",
          "--token <値> を追加して再実行してください",
        )
        process.exit(5)
        return
      }

      // 7. sandbox ポリシー生成（ハンドラ内の二段ガード用）
      const { enableStr, disableStr } = resolvePolicy({
        cli: {
          ...(a["enable-commands"] !== undefined && { enable: a["enable-commands"] }),
          ...(a["disable-commands"] !== undefined && { disable: a["disable-commands"] }),
          ...(a.project !== undefined && { project: a.project }),
        },
        env: {
          ...(process.env["COS_ENABLE_COMMANDS"] !== undefined && {
            COS_ENABLE_COMMANDS: process.env["COS_ENABLE_COMMANDS"],
          }),
          ...(process.env["COS_DISABLE_COMMANDS"] !== undefined && {
            COS_DISABLE_COMMANDS: process.env["COS_DISABLE_COMMANDS"],
          }),
          ...(process.env["COS_PROJECT"] !== undefined && {
            COS_PROJECT: process.env["COS_PROJECT"],
          }),
        },
        config: loadConfig(),
      })
      const policyOpts: Parameters<typeof createPolicy>[0] = {}
      if (enableStr !== undefined) policyOpts.enableStr = enableStr
      if (disableStr !== undefined) policyOpts.disableStr = disableStr
      const policy = createPolicy(policyOpts)

      // 8. クライアント生成
      const restClient = new CosenseRestClient({ sid })
      const writer = await createWriterFn(sid, a["dry-run"])

      // 9. ServerContext 組み立て（exactOptionalPropertyTypes 対応: token undefined は渡さない）
      const ctxBase = {
        restClient,
        writer,
        project,
        policy,
        allowWrite: a["allow-write"],
      }
      const ctx: ServerContext = a.token !== undefined ? { ...ctxBase, token: a.token } : ctxBase

      // 10. Graceful shutdown の AbortController を設定
      const controller = new AbortController()
      const onSig = () => controller.abort()
      process.once("SIGINT", onSig)
      process.once("SIGTERM", onSig)

      // 11. サーバ起動前にログ・envelope を出力（起動中であることをユーザーに示す）
      const url = `http://${a.host}:${portNum}`
      if (a.json) {
        const jsonOpts = buildJsonOpts(a)
        writeJson(
          {
            url,
            port: portNum,
            host: a.host,
            project,
            allowWrite: a["allow-write"],
            tokenRequired: a.token !== undefined,
          },
          { command: "serve.rest", startTime },
          jsonOpts,
        )
      } else {
        const writeDisabled = a["allow-write"] ? "" : "  write=disabled"
        const authInfo = a.token !== undefined ? "  auth=token" : ""
        logger.info(`Listening on ${url}  project=${project}${writeDisabled}${authInfo}`)
      }

      // 12. サーバ起動（startServer は signal abort で resolve）
      // finally でシグナルハンドラを確実にクリーンアップする
      try {
        await startServerFn(ctx, { port: portNum, hostname: a.host, signal: controller.signal })
      } finally {
        process.off("SIGINT", onSig)
        process.off("SIGTERM", onSig)
      }

      process.exit(0)
    },
  })
}

/**
 * startBunServer は Bun.serve() を使った本番サーバ起動関数。
 * signal が abort されるとサーバを停止して resolve する。
 */
async function startBunServer(
  ctx: ServerContext,
  opts: { port: number; hostname: string; signal: AbortSignal },
): Promise<void> {
  const fetchHandler = createFetchHandler(ctx)
  const server = Bun.serve({
    port: opts.port,
    hostname: opts.hostname,
    fetch: fetchHandler,
  })
  // signal が既に abort 済みの場合は即座に停止する（race condition 対策）
  if (opts.signal.aborted) {
    server.stop(true)
    return
  }
  await new Promise<void>((resolve) => {
    opts.signal.addEventListener(
      "abort",
      () => {
        server.stop(true)
        resolve()
      },
      { once: true },
    )
  })
}

/** serveCommand はデフォルト依存を使った本番コマンド。 */
export const serveCommand = makeServeCommand()
