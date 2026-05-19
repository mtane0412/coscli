/**
 * cli.ts — coscli エントリポイント。
 *
 * citty で noun-verb 階層のコマンドツリーを構築し、
 * ルートフラグ (--project, --json, --dry-run 等) と
 * sandbox (--enable-commands/--disable-commands) を一元管理する。
 */

import { rootSubCommands } from "@/commands/index"
import { setRootCommand } from "@/core/cli-root"
import { applyRootContext } from "@/infra/cli-context"
import type { RootArgs } from "@/infra/cli-context"
import { runWithHelpAndErrors } from "@/infra/cli-runner"
import { defineCommand } from "citty"

// bun build --define 'VERSION="x.y.z"' でビルド時に注入される
declare const VERSION: string

/** ルートコマンド */
const main = defineCommand({
  meta: {
    name: "cos",
    version: VERSION.replace(/^v/, ""),
    description:
      "cos is a single CLI for Cosense pages, projects, search, sync, convert, and REST proxy — built for terminals, scripts, CI, and coding agents.",
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
    json: {
      type: "boolean",
      alias: "J",
      description: "JSON 出力 (すべてのサブコマンドへ伝播)",
      default: false,
    },
    plain: {
      type: "boolean",
      alias: "P",
      description: "プレーンテキスト出力 (すべてのサブコマンドへ伝播)",
      default: false,
    },
    "results-only": {
      type: "boolean",
      description: "--json 時に data のみ返す (すべてのサブコマンドへ伝播)",
      default: false,
    },
    select: {
      type: "string",
      description: "出力セレクタ (例: pages[].title) (すべてのサブコマンドへ伝播)",
    },
  },
  setup({ args }) {
    applyRootContext(args as RootArgs, process.env)
  },
  subCommands: rootSubCommands,
})

// schema コマンドがルートを参照できるよう singleton に登録する
// exactOptionalPropertyTypes のため具体的な args 型を CommandDef に広げてから渡す
setRootCommand(main as unknown as import("citty").CommandDef)

await runWithHelpAndErrors(main as unknown as import("citty").CommandDef, process.argv.slice(2))
