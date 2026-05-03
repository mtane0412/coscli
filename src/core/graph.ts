/**
 * graph.ts — プロジェクトのページ間リンクグラフを構築・シリアライズするユースケース層。
 *
 * /api/pages/:project/search/titles から全リンク情報を取得し、
 * DOT / JSON / TSV 形式へのシリアライズを提供する。
 */

import { NotFoundError } from "@/core/api/rest"
import type { CosenseRestClient } from "@/core/api/rest"
import type { TitleSearchResult } from "@/schemas/page"

// -------------------------------------------------------------------
// 型定義
// -------------------------------------------------------------------

/** GraphNode はグラフのノード (ページ) を表す。 */
export interface GraphNode {
  /** ページ ID。未作成ページの場合はタイトルをそのまま使用する。 */
  id: string
  title: string
  /** false の場合は Cosense 上に存在しない参照先ページ */
  exists: boolean
}

/** GraphEdge はページ間のリンク (有向エッジ) を表す。 */
export interface GraphEdge {
  from: string
  to: string
}

/** GraphData はノードとエッジの集合。 */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// -------------------------------------------------------------------
// fetchAllLinks
// -------------------------------------------------------------------

/**
 * fetchAllLinks は /api/pages/:project/search/titles を逐次取得して
 * 全ページのリンク情報を返す。
 *
 * @param opts.limit - 取得上限件数 (指定時はサンプリングして早期終了)
 * @returns pages: 取得したページ一覧, truncated: limit で打ち切った場合 true
 */
export async function fetchAllLinks(
  client: CosenseRestClient,
  opts: { project: string; limit?: number },
): Promise<{ pages: TitleSearchResult[]; truncated: boolean }> {
  const { project, limit } = opts
  const allPages: TitleSearchResult[] = []
  let followingId: string | undefined

  do {
    const searchOpts: { followingId?: string } = {}
    if (followingId !== undefined) searchOpts.followingId = followingId
    const result = await client.searchTitles(project, searchOpts)
    for (const page of result.pages) {
      allPages.push(page)
      if (limit !== undefined && allPages.length >= limit) {
        return { pages: allPages, truncated: true }
      }
    }
    followingId = result.followingId
  } while (followingId)

  return { pages: allPages, truncated: false }
}

// -------------------------------------------------------------------
// buildGraph
// -------------------------------------------------------------------

/**
 * buildGraph はページ配列からグラフデータを構築する。
 *
 * @param opts.from - 起点ページタイトル (未指定時は全体グラフを返す)
 * @param opts.depth - BFS の深さ (from 指定時のみ有効、デフォルト 1)
 * @throws NotFoundError from が pages に存在しない場合
 */
export function buildGraph(
  pages: TitleSearchResult[],
  opts: { from?: string; depth?: number },
): GraphData {
  // タイトル → TitleSearchResult のマップ (存在するページ)
  const pageMap = new Map<string, TitleSearchResult>()
  for (const page of pages) {
    pageMap.set(page.title, page)
  }

  // BFS の to 側で現れる全タイトルを集め、隣接リスト (重複排除) を構築する
  // adjacency: from_title → Set<to_title>
  const adjacency = new Map<string, Set<string>>()
  for (const page of pages) {
    const targets = new Set<string>()
    for (const link of page.links ?? []) {
      // 自己参照を除外する
      if (link !== page.title) {
        targets.add(link)
      }
    }
    adjacency.set(page.title, targets)
  }

  // from 未指定: 全体グラフを返す
  if (opts.from === undefined) {
    return buildFullGraph(pages, pageMap, adjacency)
  }

  // from 指定: BFS で到達範囲を絞る
  if (!pageMap.has(opts.from)) {
    throw new NotFoundError(`ページ "${opts.from}" が見つかりません`)
  }

  const depth = opts.depth ?? 1
  return buildBfsGraph(opts.from, depth, pageMap, adjacency)
}

/** buildFullGraph は全ページ・全エッジを含むグラフを返す。 */
function buildFullGraph(
  pages: TitleSearchResult[],
  pageMap: Map<string, TitleSearchResult>,
  adjacency: Map<string, Set<string>>,
): GraphData {
  // 参照先の未作成ページも含む全タイトルを収集する
  const allTitles = new Set<string>()
  for (const page of pages) {
    allTitles.add(page.title)
    for (const link of page.links ?? []) {
      if (link !== page.title) {
        allTitles.add(link)
      }
    }
  }

  const nodes: GraphNode[] = []
  for (const title of allTitles) {
    const existing = pageMap.get(title)
    nodes.push({
      id: existing?.id ?? title,
      title,
      exists: existing !== undefined,
    })
  }

  const edges: GraphEdge[] = []
  for (const [from, targets] of adjacency) {
    for (const to of targets) {
      edges.push({ from, to })
    }
  }

  return { nodes, edges }
}

/** buildBfsGraph は起点から BFS で depth 段まで到達できるノード・エッジを返す。 */
function buildBfsGraph(
  from: string,
  depth: number,
  pageMap: Map<string, TitleSearchResult>,
  adjacency: Map<string, Set<string>>,
): GraphData {
  // BFS: visited は到達済みタイトルの Set
  const visited = new Set<string>([from])
  // キュー: [title, 現在の深さ]
  const queue: Array<[string, number]> = [[from, 0]]

  let head = 0
  while (head < queue.length) {
    const entry = queue[head]
    head++
    if (!entry) continue
    const [current, currentDepth] = entry
    if (currentDepth >= depth) continue
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push([neighbor, currentDepth + 1])
      }
    }
  }

  // nodes: BFS 到達タイトル (未作成ページも含む)
  const nodes: GraphNode[] = []
  for (const title of visited) {
    const existing = pageMap.get(title)
    nodes.push({
      id: existing?.id ?? title,
      title,
      exists: existing !== undefined,
    })
  }

  // edges: from/to が両方 visited 内に収まるもの
  const edges: GraphEdge[] = []
  for (const node of visited) {
    for (const to of adjacency.get(node) ?? []) {
      if (visited.has(to)) {
        edges.push({ from: node, to })
      }
    }
  }

  return { nodes, edges }
}

// -------------------------------------------------------------------
// serializeDot
// -------------------------------------------------------------------

/** escapeDotLabel は Graphviz DOT のラベル文字列をエスケープする。 */
function escapeDotLabel(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

/**
 * serializeDot はグラフデータを Graphviz DOT 形式に変換する。
 * エッジラベルのダブルクォート・バックスラッシュ・改行をエスケープする。
 */
export function serializeDot(graph: GraphData): string {
  const lines: string[] = ["digraph cosense {", "  rankdir=LR;"]

  for (const edge of graph.edges) {
    const from = escapeDotLabel(edge.from)
    const to = escapeDotLabel(edge.to)
    lines.push(`  "${from}" -> "${to}";`)
  }

  lines.push("}")
  return lines.join("\n")
}

// -------------------------------------------------------------------
// graphToTsvRows
// -------------------------------------------------------------------

/**
 * graphToTsvRows はグラフデータのエッジを TSV 行配列に変換する。
 * writeTsv に渡す形式 ([from_title, to_title] の配列) を返す。
 */
export function graphToTsvRows(graph: GraphData): string[][] {
  return graph.edges.map((e) => [e.from, e.to])
}
