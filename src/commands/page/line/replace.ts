/**
 * page/line/replace.ts — `cos page line replace` サブコマンドグループ。
 *
 * v2 AI ops API (PAT 必須) を使って指定行のテキストを置換する。
 * 編集は preview → submit の 2 ステップで行う。
 * submit は `cos page edit submit <previewId>` で実行する。
 */

import { showUsageIfNoSubCommand } from "@/commands/_shared"
import { pageLineReplacePreviewCommand } from "@/commands/page/line/replace/preview"
import { defineCommand } from "citty"

export const pageLineReplaceCommand = defineCommand({
  meta: {
    name: "replace",
    description: "指定行のテキストを置換する (PAT 必須、preview/submit の 2 ステップ)",
  },
  subCommands: {
    preview: pageLineReplacePreviewCommand,
  },
  run: showUsageIfNoSubCommand,
})
