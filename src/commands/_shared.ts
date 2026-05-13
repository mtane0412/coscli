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

/**
 * strictNotationArg は書き込み系コマンドが追加スプレッドする --strict-notation フラグ定義。
 *
 * Cosense 記法の lint 警告が検出された場合に書き込みを中止して exit 5 を返す。
 * 省略時は警告のみ meta.warnings に追加し書き込みは続行する。
 */
export const strictNotationArg = {
  "strict-notation": {
    type: "boolean" as const,
    description: "Cosense 記法の lint 警告を検出したら書き込みを中止する",
    default: false,
  },
} as const

/**
 * unsafeReadArg は --from-file を持つコマンドが追加スプレッドする安全読み込みバイパスフラグ定義。
 *
 * 通常はセキュリティ上の理由で禁止されているパス (.env, ~/.ssh, /etc 等) も読み込みたい
 * 場合に明示的に指定する。
 */
export const unsafeReadArg = {
  "allow-unsafe-read": {
    type: "boolean" as const,
    description: "--from-file のセキュリティチェックをバイパスする (危険: 注意して使用すること)",
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

/** StrictNotationArg は書き込み系コマンドが追加で受け取る --strict-notation フラグの型。 */
export type StrictNotationArg = { "strict-notation": boolean }

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
  // ルートフラグから環境変数経由で伝播した値を優先マージする
  return new Logger({
    quiet: args.quiet,
    json: args.json || process.env["COS_JSON"] === "1",
    plain: args.plain || process.env["COS_PLAIN"] === "1",
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
 * ルートフラグから環境変数経由で伝播した COS_RESULTS_ONLY / COS_SELECT もフォールバックとして参照する。
 */
export function buildJsonOpts(args: CommonArgs): JsonOutputOptions {
  const resultsOnly = args["results-only"] || process.env["COS_RESULTS_ONLY"] === "1"
  const opts: JsonOutputOptions = { resultsOnly }
  // args.select が明示指定された場合はそちらを優先する
  const select = args.select ?? process.env["COS_SELECT"]
  if (select !== undefined) opts.select = select
  return opts
}

/**
 * isStdinPath は path が stdin を指すかどうかを示す boolean を返す。
 *
 * citty が `--from-file -` の `-` を空文字列 `""` に変換するため、
 * `""` も stdin (`"-"`) と同等に扱う。
 */
export function isStdinPath(path: string | undefined): boolean {
  return path === "-" || path === ""
}

/**
 * getRawFlagValue は argv から指定フラグの生の値を返す。
 *
 * citty が `--flag -N` の負数引数をフラグとして解析し、値が空文字になるバグの回避策。
 * `--flag value` と `--flag=value` の両形式を解析する。
 * 同一フラグが複数回指定された場合は最後の値を返す（CLI の一般的な挙動）。
 */
export function getRawFlagValue(argv: string[], flagName: string): string | undefined {
  const longFlag = `--${flagName}`
  let result: string | undefined = undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === longFlag && i + 1 < argv.length) {
      result = argv[i + 1]
    } else if (arg?.startsWith(`${longFlag}=`)) {
      result = arg.slice(longFlag.length + 1)
    }
  }
  return result
}

const SID_MAX_LENGTH = 4096
// RFC 6265 cookie-octet: DQUOTE(0x22), comma(0x2C), semicolon(0x3B), backslash(0x5C), CTL, SP を除外
const SID_PATTERN = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/

/** SidValidationError は SID フォーマット違反を表すエラー。 */
export class SidValidationError extends Error {
  constructor() {
    super("SID のフォーマットが不正です。改行・制御文字・空白は使用できません")
    this.name = "SidValidationError"
  }
}

/** assertValidSid は SID 文字列のフォーマットを検証し、違反時は SidValidationError をスローする。 */
export function assertValidSid(sid: string): void {
  if (sid.length === 0 || sid.length > SID_MAX_LENGTH || !SID_PATTERN.test(sid)) {
    throw new SidValidationError()
  }
}

/** requireSid はセッション ID を取得し、未認証の場合はエラーで終了する。 */
export async function requireSid(profile?: string): Promise<string> {
  // CI・エージェント向けに COS_SID 環境変数を優先チェック (プロファイル指定時は無視)
  if (!profile) {
    const envSid = process.env["COS_SID"]
    if (envSid !== undefined) {
      try {
        assertValidSid(envSid)
      } catch {
        writeErrorJson(
          "INVALID_SID",
          "COS_SID のフォーマットが不正です",
          "改行・制御文字・空白を含まない印字可能 ASCII 文字列を指定してください",
        )
        exitWithError(5, "INVALID_SID")
      }
      return envSid
    }
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
  try {
    assertValidSid(sid)
  } catch {
    writeErrorJson(
      "INVALID_SID",
      "キーチェーンに保存された SID のフォーマットが不正です",
      "`cos auth logout` 後に再ログインしてください",
    )
    exitWithError(5, "INVALID_SID")
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

/**
 * notationFindingToWarning は NotationFinding を JSON envelope の warnings 文字列に変換する。
 *
 * 書式: "[行 N] rule: message (hint: ...)"
 */
export function notationFindingToWarning(
  finding: import("@/core/notation/lint").NotationFinding,
): string {
  const loc =
    finding.column !== undefined ? `行 ${finding.line} 列 ${finding.column}` : `行 ${finding.line}`
  const hint = finding.hint ? ` (修正案: ${finding.hint})` : ""
  return `[${loc}] ${finding.rule}: ${finding.message}${hint}`
}
