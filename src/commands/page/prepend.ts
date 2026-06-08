/**
 * page/prepend.ts — `cos page prepend` サブコマンドグループ。
 *
 * v2 AI ops API (PAT 必須) を使ってページ先頭（タイトル直後）に行を挿入する。
 * 編集は preview → submit の 2 ステップで行う。
 * submit は `cos page edit submit <previewId>` で実行する。
 */

import { showUsageIfNoSubCommand } from "@/commands/_shared"
import { pagePrependPreviewCommand } from "@/commands/page/prepend/preview"
import { defineCommand } from "citty"

export const pagePrependCommand = defineCommand({
  meta: {
    name: "prepend",
    description:
      "ページ先頭（タイトル直後）に行を挿入する (PAT 必須、preview/submit の 2 ステップ)",
  },
  subCommands: {
    preview: pagePrependPreviewCommand,
  },
  run: showUsageIfNoSubCommand,
})
