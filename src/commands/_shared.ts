/**
 * _shared.ts — コマンド間で共有するフラグ定義とクライアント生成ヘルパー。
 *
 * 各コマンドはここで定義した commonArgs を引数に含めることで、
 * ルートフラグを統一して受け取れる。
 */

import { CosenseRestClient } from "@/core/api/rest"
import { createScrapboxWriter } from "@/core/api/ws"
import { loadSession } from "@/core/auth/session"
import { PolicyError, createPolicy } from "@/core/sandbox"
import { loadConfig } from "@/infra/config"
import { createTokenStore } from "@/infra/keychain/index"
import { Logger } from "@/infra/logger"
import { writeErrorJson } from "@/presenter/json"
import type { JsonOutputOptions } from "@/presenter/json"

/**
 * exitWithError は指定コードでプロセスを終了する。
 * process.exit がモックされたテスト環境でも後続処理を止めるため throw を続ける。
 */
function exitWithError(code: number, message: string): never {
  process.exit(code)
  throw new Error(message)
}

/**
 * commonArgs はすべてのサブコマンドが受け取るルート共通フラグ定義。
 *
 * --dry-run を除く読み書き共通フラグ。書き込みコマンドは `dryRunArg` を追加スプレッドして
 * `WriteCommonArgs` として扱うこと。
 */
export const commonArgs = {
  project: {
    type: "string" as const,
    alias: "p",
    description: "プロジェクト名 (環境変数 COS_PROJECT でも指定可)",
  },
  profile: {
    type: "string" as const,
    description: "認証プロファイル名 (デフォルト: default)",
  },
  json: {
    type: "boolean" as const,
    alias: "J",
    description: "JSON 出力",
    default: false,
  },
  plain: {
    type: "boolean" as const,
    alias: "P",
    description: "プレーンテキスト出力 (TSV)",
    default: false,
  },
  "results-only": {
    type: "boolean" as const,
    description: "--json 時に data のみ返す",
    default: false,
  },
  select: {
    type: "string" as const,
    description: "出力セレクタ (例: pages[].title)",
  },
  "enable-commands": {
    type: "string" as const,
    description: "許可するコマンドリスト (カンマ区切り)",
  },
  "disable-commands": {
    type: "string" as const,
    description: "禁止するコマンドリスト (カンマ区切り)",
  },
  verbose: {
    type: "string" as const,
    alias: "v",
    description: "詳細出力 (-v / -vv)",
  },
  quiet: {
    type: "boolean" as const,
    alias: "q",
    description: "成功時の人間向けメッセージを抑制",
    default: false,
  },
} as const

/** dryRunArg は書き込み系コマンドが追加スプレッドする --dry-run フラグ定義。 */
export const dryRunArg = {
  "dry-run": {
    type: "boolean" as const,
    description: "書き込み計画のみ表示して実行しない",
    default: false,
  },
} as const

/** CommonArgs は --dry-run を除く読み書き共通フラグの型。WriteCommonArgs の基底型。 */
export type CommonArgs = {
  project?: string
  profile?: string
  json: boolean
  plain: boolean
  "results-only": boolean
  select?: string
  "enable-commands"?: string
  "disable-commands"?: string
  verbose?: string
  quiet: boolean
}

/** DryRunArg は書き込み系コマンドが追加で受け取る --dry-run フラグの型。 */
export type DryRunArg = { "dry-run": boolean }

/** WriteCommonArgs は書き込み系コマンドが受け取る共通フラグの型。 */
export type WriteCommonArgs = CommonArgs & DryRunArg

/** buildLogger はフラグからロガーを生成する。 */
export function buildLogger(args: CommonArgs): Logger {
  const verboseLevel =
    args.verbose === "vv" || args.verbose === "2"
      ? 2
      : args.verbose === "v" || args.verbose === "1"
        ? 1
        : 0
  return new Logger({
    quiet: args.quiet,
    json: args.json,
    plain: args.plain,
    verbose: verboseLevel,
  })
}

/**
 * checkSandbox はサンドボックスポリシーを確認する。
 * 拒否された場合は exit 7 で終了する。
 */
export function checkSandbox(commandName: string, args: CommonArgs): void {
  const config = loadConfig()
  const enableStr = args["enable-commands"] ?? process.env["COS_ENABLE_COMMANDS"]
  const disableStr =
    args["disable-commands"] ??
    process.env["COS_DISABLE_COMMANDS"] ??
    config.agent?.defaultDisableCommands?.join(",")

  if (!enableStr && !disableStr) return

  const policyOpts: Parameters<typeof createPolicy>[0] = {}
  if (enableStr !== undefined) policyOpts.enableStr = enableStr
  if (disableStr !== undefined) policyOpts.disableStr = disableStr
  const policy = createPolicy(policyOpts)
  const denied = policy.allow(commandName)
  if (denied instanceof PolicyError) {
    writeErrorJson(
      "POLICY_DENIED",
      `[denied] ${commandName} is disabled by policy`,
      "--enable-commands フラグで明示的に許可してください",
    )
    exitWithError(7, "POLICY_DENIED")
  }
}

/**
 * buildJsonOpts は CommonArgs から JsonOutputOptions を安全に生成する。
 * exactOptionalPropertyTypes に対応するため undefined を持つプロパティを除外する。
 */
export function buildJsonOpts(args: CommonArgs): JsonOutputOptions {
  const opts: JsonOutputOptions = { resultsOnly: args["results-only"] }
  if (args.select !== undefined) opts.select = args.select
  return opts
}

/** requireSid はセッション ID を取得し、未認証の場合はエラーで終了する。 */
export async function requireSid(profile?: string): Promise<string> {
  // CI・エージェント向けに COS_SID 環境変数を優先チェック (プロファイル指定時は無視)
  if (!profile) {
    const envSid = process.env["COS_SID"]
    if (envSid) return envSid
  }
  const store = createTokenStore()
  const sessionOpts = profile !== undefined ? { profile } : {}
  const sid = await loadSession(store, sessionOpts)
  if (!sid) {
    writeErrorJson(
      "AUTH_REQUIRED",
      "認証情報が見つかりません",
      "`cos auth login` を実行してログインしてください",
    )
    exitWithError(2, "AUTH_REQUIRED")
  }
  return sid
}

/** requireProject はプロジェクト名を取得し、未指定の場合はエラーで終了する。 */
export function requireProject(args: CommonArgs): string {
  const project = args.project ?? process.env["COS_PROJECT"]
  if (!project) {
    writeErrorJson(
      "PROJECT_REQUIRED",
      "プロジェクト名が指定されていません",
      "--project (-p) フラグか COS_PROJECT 環境変数でプロジェクトを指定してください",
    )
    exitWithError(5, "PROJECT_REQUIRED")
  }
  return project
}

/** buildRestClient は認証済み REST クライアントを生成する。 */
export async function buildRestClient(args: CommonArgs): Promise<CosenseRestClient> {
  const sid = await requireSid(args.profile)
  return new CosenseRestClient({ sid })
}

/** buildWriter は ScrapboxWriter を生成する。 */
export async function buildWriter(args: WriteCommonArgs) {
  const sid = await requireSid(args.profile)
  return createScrapboxWriter({ sid, dryRun: args["dry-run"] })
}
