/**
 * search.ts — `cos search <query>` コマンド。
 *
 * プロジェクト内のページを検索する。
 * デフォルトはキーワード検索。--vector でベクトル検索（意味的類似度）、
 * --infobox で infobox テーブル定義を持つページを検索する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  handleRestError,
  requireProject,
} from "@/commands/_shared"
import { findInfoboxPages } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { writePlainList, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

/** parseLimit は --limit 文字列を正の整数にパースし、無効な値は exit 5 で終了する。 */
function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) {
    exitWithError(5, `--limit の値が無効です: "${value}" (1 以上の整数を指定してください)`)
  }
  return n
}

export const searchCommand = defineCommand({
  meta: { name: "search", description: "ページを検索する" },
  args: {
    ...commonArgs,
    query: {
      type: "positional",
      description: "検索クエリ",
      required: false,
    },
    limit: {
      type: "string",
      description: "最大件数",
    },
    vector: {
      type: "boolean",
      description: "ベクトル検索 (意味的類似度) を使用する",
      default: false,
    },
    infobox: {
      type: "boolean",
      description: "infobox テーブル定義を持つページを検索する",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      query?: string
      limit?: string
      vector: boolean
      infobox: boolean
    }
    checkSandbox("search", a)
    const project = requireProject(a)
    const startTime = Date.now()

    if (a.infobox && a.vector) {
      exitWithError(5, "--infobox と --vector は同時に使用できません")
    }
    if (!a.infobox && !a.query) {
      exitWithError(5, "query は必須です")
    }

    const client = await buildRestClient(a)

    if (a.infobox) {
      try {
        // limit はフィルタリング後に適用するため findInfoboxPages には渡さない
        let pages = await findInfoboxPages(client, { project })

        if (a.query) {
          // query が指定された場合は searchPages の結果と ID で AND 絞り込みを行う
          const queryResult = await client.searchPages(project, a.query)
          const queryIds = new Set(queryResult.pages.map((p) => p.id))
          pages = pages.filter((p) => queryIds.has(p.id))
        }

        // limit をフィルタリング後に適用
        const limitNum = parseLimit(a.limit)
        if (limitNum !== undefined) pages = pages.slice(0, limitNum)

        if (a.json) {
          writeJson({ pages }, { command: "search", startTime }, buildJsonOpts(a))
          return
        }
        if (a.plain) {
          writeTsv(
            ["title"],
            pages.map((p) => [p.title]),
          )
          return
        }
        writePlainList(pages.map((p) => p.title))
      } catch (err) {
        handleRestError(err, { resourceKind: "project", resourceName: project })
        throw err
      }
      return
    }

    // ここに到達する時点で a.query は存在することが保証される（上のバリデーションで確認済み）
    const query = a.query as string

    if (a.vector) {
      const result = await client.searchVectorTitles(project, query)
      // --limit 指定時はクライアント側で件数を切り詰める
      const limitNum = parseLimit(a.limit)
      const pages = limitNum !== undefined ? result.pages.slice(0, limitNum) : result.pages

      if (a.json) {
        writeJson({ pages }, { command: "search", startTime }, buildJsonOpts(a))
        return
      }

      if (a.plain) {
        writeTsv(
          ["title"],
          pages.map((p) => [p.title]),
        )
        return
      }

      writePlainList(pages.map((p) => p.title))
      return
    }

    const searchOpts: { limit?: number } = {}
    const limitNum = parseLimit(a.limit)
    if (limitNum !== undefined) searchOpts.limit = limitNum
    const result = await client.searchPages(project, query, searchOpts)

    if (a.json) {
      writeJson(result, { command: "search", startTime }, buildJsonOpts(a))
      return
    }

    if (a.plain) {
      writeTsv(
        ["title"],
        result.pages.map((p) => [p.title]),
      )
      return
    }

    writePlainList(result.pages.map((p) => p.title))
  },
})
