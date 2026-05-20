/**
 * page/delete.ts — `cos page delete <title>` コマンド。
 *
 * ページを削除する。--force なしの場合は確認プロンプトを表示する。
 * 以下のいずれかに該当する場合は非対話モードとみなし、--force が必須になる:
 *   - --no-input フラグ指定
 *   - stdin が TTY でない (CI / パイプ環境)
 *   - 環境変数 COS_NO_INPUT=1
 *
 * 実装上の注意: citty は --no-X を args.X = false に自動変換するため、
 * args 定義は `input: { default: true }` とし、--no-input で input = false になることを利用する。
 */

import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  requireProject,
} from "@/commands/_shared"
import { deletePage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageDeleteCommand = defineCommand({
  meta: { name: "delete", description: "ページを削除する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
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
    input: {
      type: "boolean",
      description:
        "対話入力を許可 (デフォルト: true)。--no-input で禁止 (CI/エージェント向け、要 --force)",
      default: true,
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs & { title: string; force: boolean; input: boolean }
    checkSandbox("page.delete", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // stdin が TTY かつ COS_NO_INPUT=1 未設定の場合のみ対話モードとする
    const isInteractive = process.stdin.isTTY === true && process.env["COS_NO_INPUT"] !== "1"

    if (!a.force && !a["dry-run"]) {
      if (a.input && isInteractive) {
        // 対話確認 (TTY 環境で --force / --no-input / COS_NO_INPUT が未指定の場合)
        const { confirm } = await import("@clack/prompts")
        const yes = await confirm({
          message: `"${a.title}" を削除しますか？この操作は取り消せません。`,
        })
        if (!yes) {
          logger.info("キャンセルしました")
          process.exit(0)
          return
        }
      } else {
        // --no-input / non-TTY / COS_NO_INPUT=1 のいずれかの場合はエラー終了
        writeErrorJson(
          "CONFIRMATION_REQUIRED",
          "非対話モードでは --force (-y) フラグが必要です",
          "--no-input / non-TTY / COS_NO_INPUT=1 環境では --force を指定してください",
        )
        process.exit(5)
        return
      }
    }

    const writer = await buildWriter(a)
    const result = await deletePage(writer, { project, title: a.title })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.delete", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を削除しました`)
  },
})
