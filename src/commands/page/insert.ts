/**
 * page/insert.ts — `cos page insert` サブコマンドグループ。
 *
 * v2 AI ops API (PAT 必須) を使って指定行の後ろに行を挿入する。
 * 編集は preview → submit の 2 ステップで行う。
 * submit は `cos page edit submit <previewId>` で実行する。
 */

import { showUsageIfNoSubCommand } from "@/commands/_shared"
import { pageInsertPreviewCommand } from "@/commands/page/insert/preview"
import { defineCommand } from "citty"

export const pageInsertCommand = defineCommand({
  meta: {
    name: "insert",
    description: "指定行の後ろに行を挿入する (PAT 必須、preview/submit の 2 ステップ)",
  },
  subCommands: {
    preview: pageInsertPreviewCommand,
  },
  run: showUsageIfNoSubCommand,
})
