/**
 * page/list.ts — `cos page list` コマンド。
 *
 * プロジェクトのページ一覧を取得して出力する。
 * --json で envelope 形式、--plain で TSV 出力。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { listPages } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { writePlainTable, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

export const pageListCommand = defineCommand({
  meta: { description: "ページ一覧を取得する" },
  args: {
    ...commonArgs,
    limit: {
      type: "string",
      description: "取得件数 (デフォルト: 30)",
    },
    skip: {
      type: "string",
      description: "スキップ件数",
    },
    sort: {
      type: "string",
      description: "ソート順 (updated/created/accessed/pageRank/links/views/title)",
    },
  },
  async run({ args }) {
    const commonArgs = args as CommonArgs & { limit?: string; skip?: string; sort?: string }
    const logger = buildLogger(commonArgs)
    const project = requireProject(commonArgs)
    const startTime = Date.now()

    logger.info(`${project} のページ一覧を取得中...`)

    const client = await buildRestClient(commonArgs)
    const listOpts: { project: string; limit?: number; skip?: number; sort?: string } = { project }
    if (commonArgs.limit) listOpts.limit = Number(commonArgs.limit)
    if (commonArgs.skip) listOpts.skip = Number(commonArgs.skip)
    if (commonArgs.sort) listOpts.sort = commonArgs.sort
    const result = await listPages(client, listOpts)

    if (commonArgs.json) {
      writeJson(result, { command: "page.list", startTime }, buildJsonOpts(commonArgs))
      return
    }

    if (commonArgs.plain) {
      writeTsv(
        ["title", "updated", "views", "linked"],
        result.pages.map((p) => [
          p.title,
          new Date(p.updated * 1000).toISOString(),
          String(p.views),
          String(p.linked),
        ]),
      )
      return
    }

    writePlainTable(
      ["タイトル", "更新日時", "閲覧数", "被リンク"],
      result.pages.map((p) => [
        p.title,
        new Date(p.updated * 1000).toLocaleString("ja-JP"),
        String(p.views),
        String(p.linked),
      ]),
    )
  },
})
