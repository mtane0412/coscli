/**
 * page/list.ts — `cos page list` コマンド。
 *
 * プロジェクトのページ一覧を取得して出力する。
 * --json で envelope 形式、--plain で TSV 出力。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { listPages } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { writePlainTable, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

export const pageListCommand = defineCommand({
  meta: { name: "list", description: "ページ一覧を取得する" },
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
    checkSandbox("page.list", commonArgs)
    const project = requireProject(commonArgs)
    const startTime = Date.now()

    const listOpts: { project: string; limit?: number; skip?: number; sort?: string } = { project }

    // --limit バリデーション: 10進数整数のみ許可 (指数表記・16進数を除外、認証前に弾く)
    if (commonArgs.limit !== undefined) {
      if (!/^\d+$/.test(commonArgs.limit)) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--limit の値が無効です: "${commonArgs.limit}"`,
          "1 以上の整数を指定してください",
        )
        process.exit(5)
        return
      }
      const limit = Number(commonArgs.limit)
      if (limit < 1) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--limit の値が無効です: "${commonArgs.limit}"`,
          "1 以上の整数を指定してください",
        )
        process.exit(5)
        return
      }
      listOpts.limit = limit
    }

    // --skip バリデーション: 10進数整数のみ許可 (0 はスキップなしとして有効、認証前に弾く)
    if (commonArgs.skip !== undefined) {
      if (!/^\d+$/.test(commonArgs.skip)) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--skip の値が無効です: "${commonArgs.skip}"`,
          "0 以上の整数を指定してください",
        )
        process.exit(5)
        return
      }
      listOpts.skip = Number(commonArgs.skip)
    }

    if (commonArgs.sort) listOpts.sort = commonArgs.sort
    const client = await buildRestClient(commonArgs)
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
