/**
 * _shared.ts — コマンド間で共有するフラグ定義とクライアント生成ヘルパー。
 *
 * 各コマンドはここで定義した commonArgs を引数に含めることで、
 * ルートフラグを統一して受け取れる。
 */

import { AuthError, CosenseRestClient, ForbiddenError, NotFoundError } from "@/core/api/rest"
import { createScrapboxWriter } from "@/core/api/ws"
import { isValidSaKeyFormat, parseCredential } from "@/core/auth/credential"
import { loadSession } from "@/core/auth/session"
import { lintNotation } from "@/core/notation/lint"
import { normalizeCodeBlockEmptyLines } from "@/core/notation/normalize"
import { PolicyError, createPolicy } from "@/core/sandbox"
import { resolvePolicy } from "@/core/sandbox/resolve"
import { loadConfig, saveConfig } from "@/infra/config"
import { createTokenStore } from "@/infra/keychain/index"
import { Logger } from "@/infra/logger"
import { UnsafePathError, readFromFile, readStdinBounded } from "@/infra/safe-read"
import { writeErrorJson } from "@/presenter/json"
import type { JsonOutputOptions } from "@/presenter/json"
import type { CommandDef } from "citty"
import { showUsage } from "citty"

/**
 * exitWithError は指定コードでプロセスを終了する。
 * process.exit がモックされたテスト環境でも後続処理を止めるため throw を続ける。
 */
export function exitWithError(code: number, message: string): never {
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
 *
 * 優先順位: CLI フラグ > 環境変数 > プロジェクト固有設定 > defaultPermission > 全許可
 *
 * - CLI/env フラグが指定された場合はそれのみを使用 (config の disableCommands も無視)
 * - プロジェクト固有の permission / enableCommands / disableCommands はグローバルより優先
 * - defaultPermission はプロジェクト指定時のみ有効 (未指定コマンドには無効)
 * - disableCommands はプロジェクト設定に重ねて常に適用される絶対禁止リスト
 *
 * プロジェクト名は args.project > COS_PROJECT 環境変数 の順で解決し、
 * config.defaultProject はフォールバックとして使用しない。
 */
export function checkSandbox(commandName: string, args: CommonArgs): void {
  const resolved = resolvePolicy({
    cli: {
      ...(args["enable-commands"] !== undefined && { enable: args["enable-commands"] }),
      ...(args["disable-commands"] !== undefined && { disable: args["disable-commands"] }),
      ...(args.project !== undefined && { project: args.project }),
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

  if (!resolved.enableStr && !resolved.disableStr) return

  const policyOpts: Parameters<typeof createPolicy>[0] = {}
  if (resolved.enableStr !== undefined) policyOpts.enableStr = resolved.enableStr
  if (resolved.disableStr !== undefined) policyOpts.disableStr = resolved.disableStr
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

/** SidValidationError は SID フォーマット違反を表すエラー。 */
export class SidValidationError extends Error {
  constructor() {
    super("SID のフォーマットが不正です。改行・制御文字・空白は使用できません")
    this.name = "SidValidationError"
  }
}

/**
 * assertValidSid は SID 文字列のフォーマットを検証し、違反時は SidValidationError をスローする。
 *
 * PAT/SA Key を誤投入した場合も SidValidationError をスローする。
 * フォーマット検証は credential.ts の parseCredential に委譲する。
 */
export function assertValidSid(sid: string): void {
  try {
    const cred = parseCredential(sid)
    // PAT または SA として判別された場合は SID として無効
    if (cred.kind !== "sid") throw new SidValidationError()
  } catch (e) {
    if (e instanceof SidValidationError) throw e
    throw new SidValidationError()
  }
}

/** PersonalAccessTokenValidationError は PAT フォーマット違反を表すエラー。 */
export class PersonalAccessTokenValidationError extends Error {
  constructor() {
    super(
      "Personal Access Token のフォーマットが不正です。pat_ で始まる 68 文字 (pat_ + 64 桁小文字 16 進数) を指定してください",
    )
    this.name = "PersonalAccessTokenValidationError"
  }
}

/**
 * assertValidPersonalAccessToken は PAT のフォーマットを検証し、違反時は PersonalAccessTokenValidationError をスローする。
 *
 * フォーマット検証は credential.ts の parseCredential に委譲する。
 */
export function assertValidPersonalAccessToken(pat: string): void {
  try {
    const cred = parseCredential(pat)
    if (cred.kind !== "pat") throw new PersonalAccessTokenValidationError()
  } catch (e) {
    if (e instanceof PersonalAccessTokenValidationError) throw e
    throw new PersonalAccessTokenValidationError()
  }
}

/** ServiceAccountKeyValidationError は Service Account キーのフォーマット違反を表すエラー。 */
export class ServiceAccountKeyValidationError extends Error {
  constructor() {
    super(
      "Service Account キーのフォーマットが不正です。cs_ で始まる 67 文字 (cs_ + 64 桁小文字 16 進数) を指定してください",
    )
    this.name = "ServiceAccountKeyValidationError"
  }
}

/**
 * assertValidServiceAccountKey は Service Account キーのフォーマットを検証し、違反時は ServiceAccountKeyValidationError をスローする。
 *
 * project を必要としないフォーマット検証は credential.ts の isValidSaKeyFormat に委譲する。
 */
export function assertValidServiceAccountKey(key: string): void {
  if (!isValidSaKeyFormat(key)) {
    throw new ServiceAccountKeyValidationError()
  }
}

/** requireSid はセッション ID を取得し、未認証の場合はエラーで終了する。 */
export async function requireSid(profile?: string): Promise<string> {
  // CI・エージェント向けに COS_SID 環境変数を優先チェック (プロファイル指定時は無視)
  if (!profile) {
    const envSid = process.env["COS_SID"]
    if (envSid !== undefined) {
      // PAT を COS_SID に誤投入した場合: 書き込み不可を明示 (exit 2)
      if (envSid.startsWith("pat_")) {
        writeErrorJson(
          "AUTH_WRITE_NOT_SUPPORTED",
          "Personal Access Token (PAT) では書き込み操作を実行できません",
          "書き込みコマンドには connect.sid が必要です。`cos auth login --sid <connect.sid>` でログインしてください",
        )
        exitWithError(2, "AUTH_WRITE_NOT_SUPPORTED")
      }
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
  // キーチェーンに PAT が保存されている場合: 書き込み不可を明示 (exit 2)
  if (sid.startsWith("pat_")) {
    writeErrorJson(
      "AUTH_WRITE_NOT_SUPPORTED",
      "Personal Access Token (PAT) では書き込み操作を実行できません",
      "書き込みコマンドには connect.sid が必要です。`cos auth login` で SID でログインしてください",
    )
    exitWithError(2, "AUTH_WRITE_NOT_SUPPORTED")
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

/**
 * buildRestClient は認証情報を解決して REST クライアントを生成する。
 *
 * 認証解決の優先順位:
 * 0. COS_PERSONAL_ACCESS_TOKEN 環境変数 (PAT 認証、最優先)
 * 1. COS_SERVICE_ACCOUNT_KEY 環境変数 (Service Account キー認証)
 * 2. --project 指定時 + 設定ファイルの serviceAccounts に該当プロジェクトが存在 (Service Account キー認証)
 * 3. キーチェーン / COS_SID 環境変数 (PAT または SID 認証、値の pat_ プレフィックスで自動判別)
 */
export async function buildRestClient(args: CommonArgs): Promise<CosenseRestClient> {
  // 0. 環境変数 COS_PERSONAL_ACCESS_TOKEN を最優先チェック (PAT > SA Key > sid)
  const envPat = process.env["COS_PERSONAL_ACCESS_TOKEN"]
  if (envPat !== undefined) {
    try {
      assertValidPersonalAccessToken(envPat)
    } catch {
      writeErrorJson(
        "INVALID_PERSONAL_ACCESS_TOKEN",
        "COS_PERSONAL_ACCESS_TOKEN のフォーマットが不正です",
        "pat_ で始まる 68 文字の Personal Access Token を指定してください",
      )
      exitWithError(5, "INVALID_PERSONAL_ACCESS_TOKEN")
    }
    const projectForAutoWatch = args.project ?? process.env["COS_PROJECT"]
    if (projectForAutoWatch) maybeAutoAddToWatchlist(projectForAutoWatch)
    return new CosenseRestClient({ personalAccessToken: envPat })
  }

  // 1. 環境変数 COS_SERVICE_ACCOUNT_KEY を次優先チェック
  const envKey = process.env["COS_SERVICE_ACCOUNT_KEY"]
  if (envKey !== undefined) {
    try {
      assertValidServiceAccountKey(envKey)
    } catch {
      writeErrorJson(
        "INVALID_SERVICE_ACCOUNT_KEY",
        "COS_SERVICE_ACCOUNT_KEY のフォーマットが不正です",
        "cs_ で始まる 67 文字のキーを指定してください",
      )
      exitWithError(5, "INVALID_SERVICE_ACCOUNT_KEY")
    }
    const projectForAutoWatch = args.project ?? process.env["COS_PROJECT"]
    if (projectForAutoWatch) maybeAutoAddToWatchlist(projectForAutoWatch)
    return new CosenseRestClient({ serviceAccountKey: envKey })
  }

  // 2. --project 指定時は設定ファイルから SA キーを検索
  const project = args.project ?? process.env["COS_PROJECT"]
  if (project) {
    const config = loadConfig()
    const saKey = config.serviceAccounts?.[project]
    if (saKey !== undefined) {
      try {
        assertValidServiceAccountKey(saKey)
      } catch {
        writeErrorJson(
          "INVALID_SERVICE_ACCOUNT_KEY",
          `設定ファイルの ${project} の Service Account キーのフォーマットが不正です`,
          "cs_ で始まる 67 文字のキーを指定してください",
        )
        exitWithError(5, "INVALID_SERVICE_ACCOUNT_KEY")
      }
      maybeAutoAddToWatchlist(project)
      return new CosenseRestClient({ serviceAccountKey: saKey })
    }
  }

  // 3. キーチェーン / COS_SID 環境変数から認証情報を取得 (PAT / SID 自動判別)
  // requireSid は pat_ を拒否するため、buildRestClient では直接 loadSession を使う
  if (!args.profile) {
    const envSid = process.env["COS_SID"]
    if (envSid !== undefined) {
      // pat_ プレフィックスの場合は PAT として処理する (COS_PERSONAL_ACCESS_TOKEN への移行を推奨)
      if (envSid.startsWith("pat_")) {
        try {
          assertValidPersonalAccessToken(envSid)
        } catch {
          writeErrorJson(
            "INVALID_PERSONAL_ACCESS_TOKEN",
            "COS_SID に設定された Personal Access Token のフォーマットが不正です",
            "pat_ で始まる 68 文字の Personal Access Token を COS_PERSONAL_ACCESS_TOKEN 環境変数で指定してください",
          )
          exitWithError(5, "INVALID_PERSONAL_ACCESS_TOKEN")
        }
        if (project) maybeAutoAddToWatchlist(project)
        return new CosenseRestClient({ personalAccessToken: envSid })
      }
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
      if (project) maybeAutoAddToWatchlist(project)
      return new CosenseRestClient({ sid: envSid })
    }
  }
  const store = createTokenStore()
  const sessionOpts = args.profile !== undefined ? { profile: args.profile } : {}
  const token = await loadSession(store, sessionOpts)
  if (!token) {
    writeErrorJson(
      "AUTH_REQUIRED",
      "認証情報が見つかりません",
      "`cos auth login` を実行してログインしてください",
    )
    exitWithError(2, "AUTH_REQUIRED")
  }
  if (project) maybeAutoAddToWatchlist(project)
  // PAT プレフィックスの場合は PAT 認証、それ以外は SID 認証
  if (token.startsWith("pat_")) {
    try {
      assertValidPersonalAccessToken(token)
    } catch {
      writeErrorJson(
        "INVALID_PERSONAL_ACCESS_TOKEN",
        "キーチェーンに保存された Personal Access Token のフォーマットが不正です",
        "`cos auth logout` 後に `cos auth login --pat <token>` で再ログインしてください",
      )
      exitWithError(5, "INVALID_PERSONAL_ACCESS_TOKEN")
    }
    return new CosenseRestClient({ personalAccessToken: token })
  }
  try {
    assertValidSid(token)
  } catch {
    writeErrorJson(
      "INVALID_SID",
      "キーチェーンに保存された SID のフォーマットが不正です",
      "`cos auth logout` 後に再ログインしてください",
    )
    exitWithError(5, "INVALID_SID")
  }
  return new CosenseRestClient({ sid: token })
}

/**
 * maybeAutoAddToWatchlist は autoWatchlist が true のとき、
 * project をウォッチリストに追加する。すでに存在する場合は何もしない。
 *
 * autoWatchlist: true の設定時に cos コマンドでアクセスしたプロジェクトを
 * Cosense Web アプリの localStorage 相当として自動記録する。
 */
function maybeAutoAddToWatchlist(project: string): void {
  const config = loadConfig()
  if (config.autoWatchlist !== true) return
  const current = config.watchlist ?? []
  if (current.includes(project)) return
  saveConfig({ ...config, watchlist: [...current, project] })
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

/**
 * ReadWriteInputArgs は --line/--text/--from-file/stdin の入力ソース引数の型。
 *
 * `line` は citty が複数回指定を受け付けると `string[]` になるため両方を許可する。
 */
export type ReadWriteInputArgs = {
  line?: string | string[]
  text?: string
  "from-file"?: string
  "allow-unsafe-read"?: boolean
}

/**
 * readWriteInput は --line/--text/--from-file/stdin の入力ソースを統一的に解決する。
 *
 * 解決優先順位: line/text > stdin (-/"") > from-file (パス)
 * stdin/ファイル読み込み時の UnsafePathError は exit 5 (UNSAFE_PATH) で終了する。
 * すべて未指定または空の場合は requireContentErrorCode で exit 5 で終了する。
 *
 * `readStdin` / `readFile` は省略時に実実装 (readStdinBounded / readFromFile) を使用する。
 * テストコードはこれらを差し替えることでファイル I/O を回避できる。
 */
export function readWriteInput(
  args: ReadWriteInputArgs,
  opts: {
    requireContentErrorCode: string
    requireContentMessage: string
    requireContentHint?: string
    readStdin?: () => string
    readFile?: (path: string, opts: { allowUnsafe: boolean }) => string
  },
): string[] {
  const readStdinFn = opts.readStdin ?? readStdinBounded
  const readFileFn = opts.readFile ?? readFromFile
  let lines: string[] = []

  const lineValue = args.line ?? args.text
  if (lineValue !== undefined) {
    // citty が --line を複数回渡すと配列になるため string と string[] の両方に対応する
    const values = Array.isArray(lineValue) ? lineValue : [lineValue]
    lines = values.flatMap((l) => l.split(/\r?\n|\\n/))
  } else if (isStdinPath(args["from-file"])) {
    // stdin から読み込む (citty が "-" を "" に変換するバグにも対応)
    try {
      const content = readStdinFn()
      lines = content.split(/\r?\n/).filter((l, i, arr) => l !== "" || i < arr.length - 1)
    } catch (err) {
      if (err instanceof UnsafePathError) {
        // stdin には --allow-unsafe-read は適用されないためヒントを表示しない
        writeErrorJson("UNSAFE_PATH", err.message)
        exitWithError(5, "UNSAFE_PATH")
      }
      throw err
    }
  } else if (args["from-file"]) {
    // ファイルから読み込む
    try {
      const content = readFileFn(args["from-file"], {
        allowUnsafe: args["allow-unsafe-read"] ?? false,
      })
      lines = content.split(/\r?\n/).filter((l, i, arr) => l !== "" || i < arr.length - 1)
    } catch (err) {
      if (err instanceof UnsafePathError) {
        writeErrorJson("UNSAFE_PATH", err.message, "--allow-unsafe-read フラグで許可できます")
        exitWithError(5, "UNSAFE_PATH")
      }
      throw err
    }
  }

  if (lines.length === 0) {
    writeErrorJson(
      opts.requireContentErrorCode,
      opts.requireContentMessage,
      opts.requireContentHint,
    )
    exitWithError(5, opts.requireContentErrorCode)
  }

  return normalizeCodeBlockEmptyLines(lines)
}

/**
 * runNotationLint は Cosense 記法の lint 検査を実行し、警告文字列配列を返す。
 *
 * --strict-notation が true の場合は lint 指摘があると exit 5 (NOTATION_LINT) で終了する。
 * false の場合は warnings 文字列配列を返す (空配列 = 警告なし)。
 */
export function runNotationLint(lines: string[], args: StrictNotationArg): string[] {
  const findings = lintNotation(lines)
  const warnings = findings.map(notationFindingToWarning)

  if (args["strict-notation"] && findings.length > 0) {
    writeErrorJson(
      "NOTATION_LINT",
      `Cosense 記法の問題が ${findings.length} 件あります`,
      "--strict-notation を外すと警告のみで実行できます",
      { findings },
    )
    exitWithError(5, "NOTATION_LINT")
  }

  return warnings
}

/**
 * handleRestError は REST 例外を判定して該当 exit コードでプロセスを終了する。
 *
 * - AuthError → exit 2, code: AUTH_ERROR
 * - ForbiddenError → exit 3, code: FORBIDDEN
 * - NotFoundError → exit 4, code: NOT_FOUND
 * - その他 → 何もしない (呼び出し側で再スローする想定)
 */
/**
 * showUsageIfNoSubCommand はサブコマンドが指定されていない場合にのみ usage を表示する。
 * citty はサブコマンド実行後も親コマンドの run を呼ぶため、rawArgs で判定する。
 */
export async function showUsageIfNoSubCommand(ctx: {
  rawArgs: string[]
  cmd: CommandDef
}): Promise<void> {
  const subCommandNames = new Set(Object.keys(ctx.cmd.subCommands ?? {}))
  const hasSubCommand = ctx.rawArgs.some((a) => subCommandNames.has(a))
  if (!hasSubCommand) {
    await showUsage(ctx.cmd)
  }
}

export function handleRestError(
  err: unknown,
  context: { resourceKind: "page" | "project" | "snapshot"; resourceName: string },
): void {
  if (err instanceof AuthError) {
    writeErrorJson("AUTH_ERROR", err.message, "`cos auth login` を実行してください")
    exitWithError(2, "AUTH_ERROR")
  }
  if (err instanceof ForbiddenError) {
    writeErrorJson("FORBIDDEN", err.message, "アクセス権限を確認してください")
    exitWithError(3, "FORBIDDEN")
  }
  if (err instanceof NotFoundError) {
    writeErrorJson("NOT_FOUND", err.message, `${context.resourceKind}名を確認してください`)
    exitWithError(4, "NOT_FOUND")
  }
}
