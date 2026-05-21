/**
 * page/list.ts — `cos page list` コマンド。
 *
 * プロジェクトのページ一覧を取得して出力する。
 * --json で envelope 形式、--plain で TSV 出力。
 * --pinned でピン留めページのみに絞り込む（クライアントサイドフィルタ）。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  requireProject,
} from "@/commands/_shared"
import { listPages } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { writePlainTable, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

/** --sort に指定できる有効な値 */
const VALID_SORT_VALUES = [
  "updated",
  "created",
  "accessed",
  "pageRank",
  "linked",
  "views",
  "title",
  "updatedWithMe",
] as const

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
      description: "ソート順 (updated/created/accessed/pageRank/linked/views/title/updatedWithMe)",
    },
    pinned: {
      type: "boolean",
      description: "ピン留めされたページのみ表示する",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      limit?: string
      skip?: string
      sort?: string
      pinned?: boolean
    }
    checkSandbox("page.list", a)
    const project = requireProject(a)
    const startTime = Date.now()

    const listOpts: { project: string; limit?: number; skip?: number; sort?: string } = { project }

    let limitNum: number | undefined

    // --limit バリデーション: 10進数整数のみ許可 (指数表記・16進数を除外、認証前に弾く)
    if (a.limit !== undefined) {
      if (!/^\d+$/.test(a.limit)) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--limit の値が無効です: "${a.limit}"`,
          "1 以上の整数を指定してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }
      const limit = Number(a.limit)
      if (limit < 1) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--limit の値が無効です: "${a.limit}"`,
          "1 以上の整数を指定してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }
      limitNum = limit
      // --pinned 時はクライアントサイドでフィルタするため API には limit を渡さない
      if (!a.pinned) listOpts.limit = limitNum
    }

    // --skip バリデーション: 10進数整数のみ許可 (0 はスキップなしとして有効、認証前に弾く)
    if (a.skip !== undefined) {
      if (!/^\d+$/.test(a.skip)) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--skip の値が無効です: "${a.skip}"`,
          "0 以上の整数を指定してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }
      listOpts.skip = Number(a.skip)
    }

    // --sort バリデーション: 許可された値のみ受け付ける
    if (a.sort !== undefined && !(VALID_SORT_VALUES as readonly string[]).includes(a.sort)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--sort=${a.sort} は無効な値です`,
        `有効な値: ${VALID_SORT_VALUES.join(", ")}`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }
    if (a.sort) listOpts.sort = a.sort
    const client = await buildRestClient(a)
    const result = await listPages(client, listOpts)

    // --pinned フィルタ: pin > 0 のページのみ残し、limit はフィルタ後に適用する
    let pages = result.pages
    if (a.pinned) {
      pages = pages.filter((p) => (p.pin ?? 0) > 0)
      if (limitNum !== undefined) pages = pages.slice(0, limitNum)
    }

    if (a.json) {
      writeJson({ ...result, pages }, { command: "page.list", startTime }, buildJsonOpts(a))
      return
    }

    if (a.plain) {
      writeTsv(
        ["title", "updated", "views", "linked"],
        pages.map((p) => [
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
      pages.map((p) => [
        p.title,
        new Date(p.updated * 1000).toLocaleString("ja-JP"),
        String(p.views),
        String(p.linked),
      ]),
    )
  },
})
