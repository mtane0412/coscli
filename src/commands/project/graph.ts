/**
 * project/graph.ts — `cos project graph` コマンド。
 *
 * プロジェクトのページ間リンクをグラフとして export する。
 * Graphviz DOT / JSON (envelope) / TSV の 3 形式に対応する。
 *
 * データソース: /api/pages/:project/search/titles (SearchedTitle.links を利用)
 * 注意: issue 本文の "/api/pages/:project の links" は誤記で、実際は search/titles が正しい。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { AuthError, NotFoundError } from "@/core/api/rest"
import { buildGraph, fetchAllLinks, graphToTsvRows, serializeDot } from "@/core/graph"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

/** 許可する --format の値 */
const VALID_FORMATS = ["json", "dot", "csv"] as const
type GraphFormat = (typeof VALID_FORMATS)[number]

export const projectGraphCommand = defineCommand({
  meta: { description: "プロジェクトのページ間リンクをグラフとして export する" },
  args: {
    ...commonArgs,
    format: {
      type: "string",
      description: "出力形式 (json / dot / csv)",
      default: "json",
    },
    from: {
      type: "string",
      description: "BFS 起点ページタイトル (未指定時は全体グラフを出力)",
    },
    depth: {
      type: "string",
      description: "BFS の深さ (--from 指定時のみ有効、デフォルト: 1)",
      default: "1",
    },
    limit: {
      type: "string",
      description: "取得するページ数の上限 (サンプリング用)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      format: string
      from?: string
      depth: string
      limit?: string
    }

    checkSandbox("project.graph", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --format バリデーション
    if (!(VALID_FORMATS as readonly string[]).includes(a.format)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `無効な --format 値です: ${a.format}`,
        `--format には ${VALID_FORMATS.join(" / ")} のいずれかを指定してください`,
      )
      process.exit(5)
      return
    }
    const format = a.format as GraphFormat

    // --depth バリデーション
    const depth = Number(a.depth)
    if (!Number.isInteger(depth) || depth < 0) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--depth には 0 以上の整数を指定してください: ${a.depth}`,
        "例: --depth=2",
      )
      process.exit(5)
      return
    }

    // --limit バリデーション
    let limit: number | undefined
    if (a.limit !== undefined) {
      limit = Number(a.limit)
      if (!Number.isInteger(limit) || limit < 1) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--limit には 1 以上の整数を指定してください: ${a.limit}`,
          "例: --limit=100",
        )
        process.exit(5)
        return
      }
    }

    logger.info(`プロジェクト "${project}" のリンクグラフを取得中...`)

    const client = await buildRestClient(a)

    let pages: import("@/schemas/page").TitleSearchResult[]
    let truncated: boolean
    try {
      const fetchOpts: { project: string; limit?: number } = { project }
      if (limit !== undefined) fetchOpts.limit = limit
      const result = await fetchAllLinks(client, fetchOpts)
      pages = result.pages
      truncated = result.truncated
    } catch (err) {
      if (err instanceof AuthError) {
        writeErrorJson(
          "AUTH_REQUIRED",
          "認証情報が無効です。再度ログインしてください",
          "`cos auth login` を実行してください",
        )
        process.exit(2)
        return
      }
      throw err
    }

    // グラフ構築 (--from が存在しない場合は NotFoundError)
    let graph: import("@/core/graph").GraphData
    try {
      const graphOpts: { from?: string; depth?: number } = { depth }
      if (a.from !== undefined) graphOpts.from = a.from
      graph = buildGraph(pages, graphOpts)
    } catch (err) {
      if (err instanceof NotFoundError) {
        writeErrorJson(
          "NOT_FOUND",
          `ページ "${a.from}" が見つかりません`,
          "プロジェクト内に存在するページタイトルを --from に指定してください",
        )
        process.exit(4)
        return
      }
      throw err
    }

    // warnings 構築
    const warnings: string[] = []
    if (truncated) {
      warnings.push(`limit に達したため全体の一部 (${pages.length} ページ) のみ取得しました`)
    }
    const unexistingCount = graph.nodes.filter((n) => !n.exists).length
    if (unexistingCount > 0) {
      warnings.push(`Cosense 上に存在しない参照先ページが ${unexistingCount} 件あります`)
    }

    // フォーマット別出力
    if (format === "dot") {
      process.stdout.write(`${serializeDot(graph)}\n`)
      return
    }

    if (format === "csv") {
      writeTsv(["from_title", "to_title"], graphToTsvRows(graph))
      return
    }

    // format === "json": envelope 形式 (--results-only で { nodes, edges } のみ)
    writeJson(graph, { command: "project.graph", startTime, warnings }, buildJsonOpts(a))
  },
})
