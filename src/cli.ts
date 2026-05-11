/**
 * cli.ts — coscli エントリポイント。
 *
 * citty で noun-verb 階層のコマンドツリーを構築し、
 * ルートフラグ (--project, --json, --dry-run 等) と
 * sandbox (--enable-commands/--disable-commands) を一元管理する。
 */

import { setRootCommand } from "@/core/cli-root"
import { extractErrorMessage, extractStackTrace, resolveExitCode } from "@/infra/cli-error-handler"
import { initColor } from "@/infra/color"
import { createCustomShowUsage } from "@/infra/help"
import { Logger } from "@/infra/logger"
import { writeErrorJson } from "@/presenter/json"
import { defineCommand, runCommand } from "citty"

// bun build --define 'VERSION="x.y.z"' でビルド時に注入される
declare const VERSION: string

import { pageAppendCommand } from "@/commands/page/append"
import { pageCodeCommand } from "@/commands/page/code"
import { pageDeleteCommand } from "@/commands/page/delete"
import { pageEditCommand } from "@/commands/page/edit"
import { pageGetCommand } from "@/commands/page/get"
import { pageIconCommand } from "@/commands/page/icon"
import { pageInsertCommand } from "@/commands/page/insert"
// ページコマンド
import { pageListCommand } from "@/commands/page/list"
import { pageNewCommand } from "@/commands/page/new"
import { pagePinCommand } from "@/commands/page/pin"
import { pagePrependCommand } from "@/commands/page/prepend"
import { pageRenameCommand } from "@/commands/page/rename"
import { pageTextCommand } from "@/commands/page/text"
import { pageUnpinCommand } from "@/commands/page/unpin"
import { pageUrlCommand } from "@/commands/page/url"
import { pageWatchCommand } from "@/commands/page/watch"

import { projectGraphCommand } from "@/commands/project/graph"
import { projectInfoCommand } from "@/commands/project/info"
// プロジェクトコマンド
import { projectListCommand } from "@/commands/project/list"

// 検索コマンド
import { searchCommand } from "@/commands/search"

// 認証コマンド
import { authLoginCommand } from "@/commands/auth/login"
import { authLogoutCommand } from "@/commands/auth/logout"
import { authWhoamiCommand } from "@/commands/auth/whoami"

// 設定コマンド
import { configGetCommand } from "@/commands/config/get"
import { configPathCommand } from "@/commands/config/path"
import { configSetCommand } from "@/commands/config/set"

// 同期コマンド
import { syncDiffCommand } from "@/commands/sync/diff"
import { syncPullCommand } from "@/commands/sync/pull"
import { syncPushCommand } from "@/commands/sync/push"

// 変換コマンド
import { convertCommand } from "@/commands/convert"

// サーブコマンド
import { serveCommand } from "@/commands/serve"

// エージェント向け補助コマンド
import { exitCodesCommand } from "@/commands/exit-codes"
import { schemaCommand } from "@/commands/schema"

/** page サブコマンドグループ */
const pageCommand = defineCommand({
  meta: { name: "page", description: "ページ操作コマンド" },
  subCommands: {
    list: pageListCommand,
    ls: pageListCommand,
    get: pageGetCommand,
    text: pageTextCommand,
    code: pageCodeCommand,
    url: pageUrlCommand,
    new: pageNewCommand,
    create: pageNewCommand,
    edit: pageEditCommand,
    ed: pageEditCommand,
    append: pageAppendCommand,
    prepend: pagePrependCommand,
    insert: pageInsertCommand,
    rename: pageRenameCommand,
    mv: pageRenameCommand,
    pin: pagePinCommand,
    unpin: pageUnpinCommand,
    icon: pageIconCommand,
    delete: pageDeleteCommand,
    rm: pageDeleteCommand,
    watch: pageWatchCommand,
  },
})

/** project サブコマンドグループ */
const projectCommand = defineCommand({
  meta: { name: "project", description: "プロジェクト操作コマンド" },
  subCommands: {
    list: projectListCommand,
    ls: projectListCommand,
    info: projectInfoCommand,
    graph: projectGraphCommand,
  },
})

/** auth サブコマンドグループ */
const authCommand = defineCommand({
  meta: { name: "auth", description: "認証コマンド" },
  subCommands: {
    login: authLoginCommand,
    logout: authLogoutCommand,
    whoami: authWhoamiCommand,
    me: authWhoamiCommand,
  },
})

/** config サブコマンドグループ */
const configCommand = defineCommand({
  meta: { name: "config", description: "設定コマンド" },
  subCommands: {
    get: configGetCommand,
    set: configSetCommand,
    path: configPathCommand,
  },
})

/** sync サブコマンドグループ */
const syncCommand = defineCommand({
  meta: { name: "sync", description: "ローカルファイルと Cosense の同期コマンド" },
  subCommands: {
    pull: syncPullCommand,
    push: syncPushCommand,
    diff: syncDiffCommand,
  },
})

/** ルートコマンド */
const main = defineCommand({
  meta: {
    name: "cos",
    version: VERSION,
    description: "AI エージェント親和的 Cosense (Scrapbox) CLI",
  },
  args: {
    "enable-commands": {
      type: "string",
      description: "許可するコマンドリスト (カンマ区切り: page.list,page.get)",
    },
    "disable-commands": {
      type: "string",
      description: "禁止するコマンドリスト (カンマ区切り: page.delete)",
    },
    color: {
      type: "string",
      description: "色設定 (auto/always/never)",
      default: process.env["COS_COLOR"] ?? "auto",
    },
  },
  setup({ args }) {
    // 色初期化
    const colorMode = (args.color ?? "auto") as "auto" | "always" | "never"
    initColor(colorMode)

    // sandbox ポリシーのプリセット設定を環境変数に反映する
    // 実際の判定は各コマンドの checkSandbox() で行う
    if (args["enable-commands"]) {
      process.env["COS_ENABLE_COMMANDS"] = args["enable-commands"]
    }
    if (args["disable-commands"]) {
      process.env["COS_DISABLE_COMMANDS"] = args["disable-commands"]
    }
  },
  subCommands: {
    page: pageCommand,
    project: projectCommand,
    search: searchCommand,
    find: searchCommand,
    auth: authCommand,
    login: authLoginCommand,
    me: authWhoamiCommand,
    config: configCommand,
    sync: syncCommand,
    convert: convertCommand,
    serve: serveCommand,
    "exit-codes": exitCodesCommand,
    schema: schemaCommand,
  },
})

// schema コマンドがルートを参照できるよう singleton に登録する
// exactOptionalPropertyTypes のため具体的な args 型を CommandDef に広げてから渡す
setRootCommand(main as unknown as import("citty").CommandDef)

const rawArgs = process.argv.slice(2)
const showUsageFn = createCustomShowUsage(main as unknown as import("citty").CommandDef, "cos")

// --help / -h: citty の showUsage を呼んで exit 0
if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  await showUsageFn(main as unknown as import("citty").CommandDef, null as never)
  process.exit(0)
}

// --version (単独): バージョンを表示して exit 0
if (rawArgs.length === 1 && rawArgs[0] === "--version") {
  const meta =
    typeof main.meta === "function" ? await main.meta() : await Promise.resolve(main.meta)
  const version = (meta?.version ?? "").replace(/^v/, "")
  console.log(version)
  process.exit(0)
}

// 通常コマンド実行: runCommand を直接呼び、エラーを自前で分類する
const isJson = rawArgs.some((a) => a === "--json" || a === "-J")
const isVerbose = rawArgs.some(
  (a) => a === "-v" || a === "-vv" || a === "--verbose" || a.startsWith("--verbose="),
)

try {
  await runCommand(main, { rawArgs })
} catch (err) {
  const exitCode = resolveExitCode(err)
  const message = extractErrorMessage(err)
  const stack = isVerbose ? extractStackTrace(err) : undefined

  if (isJson) {
    writeErrorJson(exitCode === 5 ? "VALIDATION_ERROR" : "ERROR", message)
  } else {
    const logger = new Logger()
    logger.error(message)
    if (stack) {
      process.stderr.write(`${stack}\n`)
    }
  }
  process.exit(exitCode)
}
