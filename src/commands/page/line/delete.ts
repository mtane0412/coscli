/**
 * page/line/delete.ts — `cos page line delete` サブコマンドグループ。
 *
 * v2 AI ops API (PAT 必須) を使って指定行または行範囲を削除する。
 * 編集は preview → submit の 2 ステップで行う。
 * submit は `cos page edit submit <previewId>` で実行する。
 */

import { showUsageIfNoSubCommand } from "@/commands/_shared"
import { pageLineDeletePreviewCommand } from "@/commands/page/line/delete/preview"
import { defineCommand } from "citty"

export const pageLineDeleteCommand = defineCommand({
  meta: {
    name: "delete",
    description: "指定行または行範囲を削除する (PAT 必須、preview/submit の 2 ステップ)",
  },
  subCommands: {
    preview: pageLineDeletePreviewCommand,
  },
  run: showUsageIfNoSubCommand,
})
