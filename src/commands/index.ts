/**
 * commands/index.ts — トップレベルサブコマンドレジストリ。
 *
 * cli.ts から分離したサブコマンドツリー定義。
 * 新しいコマンドを追加する際は rootSubCommands に追加し、
 * alias がある場合はここに登録すること (CLAUDE.md の alias ルールを参照)。
 */

import { pageAppendCommand } from "@/commands/page/append"
import { pageCodeCommand } from "@/commands/page/code"
import { pageContextCommand } from "@/commands/page/context"
import { pageDeleteCommand } from "@/commands/page/delete"
import { pageEditCommand } from "@/commands/page/edit"
import { pageGetCommand } from "@/commands/page/get"
import { pageHistoryCommand } from "@/commands/page/history"
import { pageIconCommand } from "@/commands/page/icon"
import { pageInfoboxCommand } from "@/commands/page/infobox"
import { pageInsertCommand } from "@/commands/page/insert"
import { pageLineDeleteCommand } from "@/commands/page/line/delete"
import { pageLineGetCommand } from "@/commands/page/line/get"
import { pageLineReplaceCommand } from "@/commands/page/line/replace"
// ページコマンド
import { pageListCommand } from "@/commands/page/list"
import { pageNewCommand } from "@/commands/page/new"
import { pagePinCommand } from "@/commands/page/pin"
import { pagePrependCommand } from "@/commands/page/prepend"
import { pageRenameCommand } from "@/commands/page/rename"
import { pageSnapshotGetCommand } from "@/commands/page/snapshot/get"
import { pageSnapshotListCommand } from "@/commands/page/snapshot/list"
import { pageTableCommand } from "@/commands/page/table"
import { pageTextCommand } from "@/commands/page/text"
import { pageUnpinCommand } from "@/commands/page/unpin"
import { pageUpdateLinksCommand } from "@/commands/page/update-links"
import { pageUrlCommand } from "@/commands/page/url"
import { pageWatchCommand } from "@/commands/page/watch"

import { projectGraphCommand } from "@/commands/project/graph"
import { projectInfoCommand } from "@/commands/project/info"
// プロジェクトコマンド
import { projectListCommand } from "@/commands/project/list"
import { projectSearchCommand } from "@/commands/project/search"
import { projectStreamCommand } from "@/commands/project/stream"

// 検索コマンド
import { searchCommand } from "@/commands/search"

// 認証コマンド
import { authAddCommand } from "@/commands/auth/add"
import { authDoctorCommand } from "@/commands/auth/doctor"
import { authListCommand } from "@/commands/auth/list"
import { authLoginCommand } from "@/commands/auth/login"
import { authLogoutCommand } from "@/commands/auth/logout"
import { authMigrateCommand } from "@/commands/auth/migrate"
import { authStatusCommand } from "@/commands/auth/status"
import { authUseCommand } from "@/commands/auth/use"
import { authWhoamiCommand } from "@/commands/auth/whoami"

// 設定コマンド
import { configGetCommand } from "@/commands/config/get"
import { configPathCommand } from "@/commands/config/path"
import { configSetCommand } from "@/commands/config/set"

// 同期コマンド
import { syncDiffCommand } from "@/commands/sync/diff"
import { syncPullCommand } from "@/commands/sync/pull"
import { syncPushCommand } from "@/commands/sync/push"

// ウォッチリストコマンド
import { watchListAddCommand } from "@/commands/watch-list/add"
import { watchListListCommand } from "@/commands/watch-list/list"
import { watchListRemoveCommand } from "@/commands/watch-list/remove"

// 変換コマンド
import { convertCommand } from "@/commands/convert"

// サーブコマンド
import { serveCommand } from "@/commands/serve"

// エージェント向け補助コマンド
import { exitCodesCommand } from "@/commands/exit-codes"
import { notationGuideCommand } from "@/commands/notation/guide"
import { schemaCommand } from "@/commands/schema"

import { showUsageIfNoSubCommand } from "@/commands/_shared"
import { defineCommand } from "citty"

/** page line サブコマンドグループ */
export const pageLineCommand = defineCommand({
  meta: { name: "line", description: "行単位編集 (replace / delete / get)" },
  subCommands: {
    replace: pageLineReplaceCommand,
    delete: pageLineDeleteCommand,
    rm: pageLineDeleteCommand,
    get: pageLineGetCommand,
  },
  run: showUsageIfNoSubCommand,
})

/** page snapshot サブコマンドグループ */
export const pageSnapshotCommand = defineCommand({
  meta: { name: "snapshot", description: "ページのスナップショット (list / get)" },
  subCommands: {
    list: pageSnapshotListCommand,
    ls: pageSnapshotListCommand,
    get: pageSnapshotGetCommand,
  },
  run: showUsageIfNoSubCommand,
})

/** page サブコマンドグループ */
export const pageCommand = defineCommand({
  meta: { name: "page", description: "ページ操作コマンド" },
  subCommands: {
    list: pageListCommand,
    ls: pageListCommand,
    get: pageGetCommand,
    text: pageTextCommand,
    code: pageCodeCommand,
    table: pageTableCommand,
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
    "update-links": pageUpdateLinksCommand,
    "replace-links": pageUpdateLinksCommand,
    pin: pagePinCommand,
    unpin: pageUnpinCommand,
    icon: pageIconCommand,
    history: pageHistoryCommand,
    snapshot: pageSnapshotCommand,
    delete: pageDeleteCommand,
    rm: pageDeleteCommand,
    watch: pageWatchCommand,
    context: pageContextCommand,
    infobox: pageInfoboxCommand,
    line: pageLineCommand,
  },
  run: showUsageIfNoSubCommand,
})

/** project サブコマンドグループ */
export const projectCommand = defineCommand({
  meta: { name: "project", description: "プロジェクト操作コマンド" },
  subCommands: {
    list: projectListCommand,
    ls: projectListCommand,
    info: projectInfoCommand,
    graph: projectGraphCommand,
    stream: projectStreamCommand,
    search: projectSearchCommand,
  },
  run: showUsageIfNoSubCommand,
})

/** auth サブコマンドグループ */
export const authCommand = defineCommand({
  meta: { name: "auth", description: "認証コマンド" },
  subCommands: {
    add: authAddCommand,
    login: authLoginCommand,
    logout: authLogoutCommand,
    whoami: authWhoamiCommand,
    me: authWhoamiCommand,
    migrate: authMigrateCommand,
    list: authListCommand,
    ls: authListCommand,
    status: authStatusCommand,
    doctor: authDoctorCommand,
    use: authUseCommand,
  },
  run: showUsageIfNoSubCommand,
})

/** config サブコマンドグループ */
export const configCommand = defineCommand({
  meta: { name: "config", description: "設定コマンド" },
  subCommands: {
    get: configGetCommand,
    set: configSetCommand,
    path: configPathCommand,
  },
  run: showUsageIfNoSubCommand,
})

/** watch-list サブコマンドグループ */
export const watchListCommand = defineCommand({
  meta: { name: "watch-list", description: "ウォッチリスト管理 (list / add / remove)" },
  subCommands: {
    list: watchListListCommand,
    ls: watchListListCommand,
    add: watchListAddCommand,
    remove: watchListRemoveCommand,
    rm: watchListRemoveCommand,
  },
  run: showUsageIfNoSubCommand,
})

/** sync サブコマンドグループ */
export const syncCommand = defineCommand({
  meta: { name: "sync", description: "ローカルファイルと Cosense の同期コマンド" },
  subCommands: {
    pull: syncPullCommand,
    push: syncPushCommand,
    diff: syncDiffCommand,
  },
  run: showUsageIfNoSubCommand,
})

/** rootSubCommands はトップレベルサブコマンドのレジストリ。 */
export const rootSubCommands = {
  page: pageCommand,
  project: projectCommand,
  search: searchCommand,
  find: searchCommand,
  auth: authCommand,
  // トップレベルエイリアス: alias ルール (CLAUDE.md) に従い cli.ts でも同時登録すること
  login: authLoginCommand,
  me: authWhoamiCommand,
  config: configCommand,
  sync: syncCommand,
  "watch-list": watchListCommand,
  convert: convertCommand,
  serve: serveCommand,
  "exit-codes": exitCodesCommand,
  schema: schemaCommand,
  notation: notationGuideCommand,
} as const
