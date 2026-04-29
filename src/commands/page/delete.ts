/**
 * page/delete.ts — `cos page delete <title>` コマンド。
 *
 * ページを削除する。--force なしの場合は確認プロンプトを表示する。
 * --no-input 時は --force が必須。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { deletePage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageDeleteCommand = defineCommand({
  meta: { description: "ページを削除する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    force: {
      type: "boolean",
      alias: "y",
      description: "確認プロンプトをスキップ",
      default: false,
    },
    "no-input": {
      type: "boolean",
      description: "対話入力を禁止 (CI/エージェント向け)",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; force: boolean; "no-input": boolean }
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    if (!a.force && !a["no-input"] && !a["dry-run"]) {
      // 対話確認 (--force または --no-input 未指定時)
      const { confirm } = await import("@clack/prompts")
      const yes = await confirm({
        message: `"${a.title}" を削除しますか？この操作は取り消せません。`,
      })
      if (!yes) {
        logger.info("キャンセルしました")
        process.exit(0)
      }
    } else if (!a.force && a["no-input"] && !a["dry-run"]) {
      writeErrorJson("CONFIRMATION_REQUIRED", "--no-input モードでは --force (-y) フラグが必要です")
      process.exit(5)
    }

    logger.info(`"${a.title}" を削除中...`)

    const writer = await buildWriter(a)
    const result = await deletePage(writer, { project, title: a.title })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.delete", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を削除しました`)
  },
})
