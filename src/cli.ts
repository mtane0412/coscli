/**
 * cli.ts — coscli エントリポイント。
 *
 * citty で noun-verb 階層のコマンドツリーを構築し、
 * ルートフラグ (--project, --json, --dry-run 等) と
 * sandbox (--enable-commands/--disable-commands) を一元管理する。
 */

import { initColor } from "@/infra/color"
import { defineCommand, runMain } from "citty"

// bun build --define 'VERSION="x.y.z"' でビルド時に注入される
declare const VERSION: string

import { pageAppendCommand } from "@/commands/page/append"
import { pageCodeCommand } from "@/commands/page/code"
import { pageDeleteCommand } from "@/commands/page/delete"
import { pageEditCommand } from "@/commands/page/edit"
import { pageGetCommand } from "@/commands/page/get"
// ページコマンド
import { pageListCommand } from "@/commands/page/list"
import { pageNewCommand } from "@/commands/page/new"
import { pageTextCommand } from "@/commands/page/text"
import { pageUrlCommand } from "@/commands/page/url"

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

/** page サブコマンドグループ */
const pageCommand = defineCommand({
  meta: { description: "ページ操作コマンド" },
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
    delete: pageDeleteCommand,
    rm: pageDeleteCommand,
  },
})

/** project サブコマンドグループ */
const projectCommand = defineCommand({
  meta: { description: "プロジェクト操作コマンド" },
  subCommands: {
    list: projectListCommand,
    ls: projectListCommand,
    info: projectInfoCommand,
  },
})

/** auth サブコマンドグループ */
const authCommand = defineCommand({
  meta: { description: "認証コマンド" },
  subCommands: {
    login: authLoginCommand,
    logout: authLogoutCommand,
    whoami: authWhoamiCommand,
    me: authWhoamiCommand,
  },
})

/** config サブコマンドグループ */
const configCommand = defineCommand({
  meta: { description: "設定コマンド" },
  subCommands: {
    get: configGetCommand,
    set: configSetCommand,
    path: configPathCommand,
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
  },
})

runMain(main)
