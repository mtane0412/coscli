/**
 * page/append.ts — `cos page append` サブコマンドグループ。
 *
 * v2 AI ops API (PAT 必須) を使ってページ末尾に行を追加する。
 * 編集は preview → submit の 2 ステップで行う。
 * submit は `cos page edit submit <previewId>` で実行する。
 */

import { showUsageIfNoSubCommand } from "@/commands/_shared"
import { pageAppendPreviewCommand } from "@/commands/page/append/preview"
import { defineCommand } from "citty"

export const pageAppendCommand = defineCommand({
  meta: {
    name: "append",
    description: "ページ末尾に行を追加する (PAT 必須、preview/submit の 2 ステップ)",
  },
  subCommands: {
    preview: pageAppendPreviewCommand,
  },
  run: showUsageIfNoSubCommand,
})
