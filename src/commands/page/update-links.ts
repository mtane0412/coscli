/**
 * page/update-links.ts — `cos page update-links <from> <to>` コマンド。
 *
 * プロジェクト内の指定テキストで構成されているリンクを一括で新テキストに置換する。
 * 主にページリネーム後に被リンクを更新するために使用する。
 */

import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  dryRunArg,
  requireProject,
} from "@/commands/_shared"
import { updateLinks } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageUpdateLinksCommand = defineCommand({
  meta: { name: "update-links", description: "プロジェクト内のリンクを一括置換する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
    from: {
      type: "positional",
      description: "置換元リンクテキスト",
      required: true,
    },
    to: {
      type: "positional",
      description: "置換先リンクテキスト",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs & { from: string; to: string }
    checkSandbox("page.update-links", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    if (a["dry-run"]) {
      writeJson(
        { from: a.from, to: a.to, dryRun: true },
        { command: "page.update-links", startTime },
        buildJsonOpts(a),
      )
      logger.success(`"${a.from}" → "${a.to}" のリンク置換をプレビューしました (--dry-run)`)
      return
    }

    const client = await buildRestClient(a)
    const result = await updateLinks(client, { project, from: a.from, to: a.to })

    writeJson(
      { from: a.from, to: a.to, updatedCount: result.updatedCount },
      { command: "page.update-links", startTime },
      buildJsonOpts(a),
    )
    logger.success(`"${a.from}" → "${a.to}" を ${result.updatedCount} ページで更新しました`)
  },
})
