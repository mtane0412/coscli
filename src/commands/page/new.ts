/**
 * page/new.ts — `cos page new` サブコマンドグループ。
 *
 * v2 AI ops API (PAT 必須) を使って新しいページを作成する。
 * 編集は preview → submit の 2 ステップで行う。
 * submit は `cos page edit submit <previewId>` で実行する。
 */

import { showUsageIfNoSubCommand } from "@/commands/_shared"
import { pageNewPreviewCommand } from "@/commands/page/new/preview"
import { defineCommand } from "citty"

export const pageNewCommand = defineCommand({
  meta: {
    name: "new",
    description: "新しいページを作成する (PAT 必須、preview/submit の 2 ステップ)",
  },
  subCommands: {
    preview: pageNewPreviewCommand,
  },
  run: showUsageIfNoSubCommand,
})
