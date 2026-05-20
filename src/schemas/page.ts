/**
 * page.ts — Cosense ページ関連の zod スキーマ定義。
 *
 * /api/pages/:project および /api/pages/:project/:title のレスポンスを検証する。
 */

import { z } from "zod"

/**
 * InfoboxResultItem は LLM が生成した infobox の 1 件分のデータ。
 *
 * hallucination が true の場合、LLM が幻覚した可能性がある。
 * truncated が true の場合、出力が切り捨てられている。
 */
export const InfoboxResultItemSchema = z.object({
  title: z.string(),
  infobox: z.record(z.string(), z.string()),
  hallucination: z.boolean(),
  truncated: z.boolean(),
})
export type InfoboxResultItem = z.infer<typeof InfoboxResultItemSchema>

/** Line は Cosense ページの 1 行を表す。 */
export const LineSchema = z.object({
  id: z.string(),
  text: z.string(),
  userId: z.string(),
  created: z.number(),
  updated: z.number(),
})
export type Line = z.infer<typeof LineSchema>

/** PageSummary はページ一覧に含まれる軽量なページ情報。 */
export const PageSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  image: z.string().nullable().optional(),
  descriptions: z.array(z.string()).optional(),
  user: z
    .object({
      id: z.string(),
      // 実 API では name / displayName が省略される場合がある
      name: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
  pin: z.number().optional(),
  views: z.number().optional(),
  linked: z.number().optional(),
  commitId: z.string().optional(),
  created: z.number(),
  updated: z.number(),
  accessed: z.number().optional(),
  snapshotCreated: z.number().nullable().optional(),
  pageRank: z.number().optional(),
})
export type PageSummary = z.infer<typeof PageSummarySchema>

/** Page は個別ページの詳細情報。 */
export const PageSchema = z.object({
  id: z.string(),
  title: z.string(),
  image: z.string().nullable().optional(),
  descriptions: z.array(z.string()).optional(),
  user: z
    .object({
      id: z.string(),
      // 実 API では name / displayName が省略される場合がある
      name: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
  pin: z.number().optional(),
  views: z.number().optional(),
  linked: z.number().optional(),
  // 実 API: 新規作成直後のページは commitId が無いことがある
  commitId: z.string().optional(),
  created: z.number(),
  updated: z.number(),
  accessed: z.number().optional(),
  snapshotCreated: z.number().nullable().optional(),
  persistent: z.boolean().optional(),
  lines: z.array(LineSchema),
  links: z.array(z.string()).optional(),
  icons: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  relatedPages: z
    .object({
      links1hop: z.array(PageSummarySchema).optional(),
      links2hop: z.array(PageSummarySchema).optional(),
      hasBackLinks: z.boolean().optional(),
    })
    .optional(),
  /** table:infobox 記法の行データ */
  infoboxDefinition: z.array(z.string()).optional(),
  /** LLM が生成した infobox の結果一覧 */
  infoboxResult: z.array(InfoboxResultItemSchema).optional(),
  /** infobox でリンクを無効化するページタイトル一覧 */
  infoboxDisableLinks: z.array(z.string()).optional(),
})
export type Page = z.infer<typeof PageSchema>

/** PageListResponse は /api/pages/:project のレスポンス全体。 */
export const PageListResponseSchema = z.object({
  projectName: z.string(),
  skip: z.number(),
  limit: z.number(),
  count: z.number(),
  pages: z.array(PageSummarySchema),
})
export type PageListResponse = z.infer<typeof PageListResponseSchema>

/** SearchResult は /api/pages/:project/search/query のレスポンス。 */
export const SearchResultSchema = z.object({
  // 実 API (認証あり): query はオブジェクト形式 { words, excludes } を返すことがある
  // セキュリティ: .passthrough() を使用せず既知フィールドのみ定義する (未知キーはデフォルトでストリップ)
  query: z
    .union([
      z.string(),
      z.object({
        words: z.array(z.string()).optional(),
        excludes: z.array(z.string()).optional(),
      }),
    ])
    .optional(),
  pages: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      image: z.string().nullable().optional(),
      descriptions: z.array(z.string()).optional(),
      words: z.array(z.string()).optional(),
      // 実 API: search/query の pages[] は lines: string[] を含む
      lines: z.array(z.string()).optional(),
    }),
  ),
  existsSelectedProject: z.boolean().optional(),
  projectName: z.string(),
  searchQuery: z.string().optional(),
})
export type SearchResult = z.infer<typeof SearchResultSchema>

/** TitleSearchResult は /api/pages/:project/search/titles のレスポンス要素。 */
export const TitleSearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  updated: z.number(),
  exists: z.boolean().optional(),
  /** ページが張っている前方リンク先のタイトル一覧 */
  links: z.array(z.string()).optional(),
  image: z.string().nullable().optional(),
})
export type TitleSearchResult = z.infer<typeof TitleSearchResultSchema>

/**
 * VectorTitleSearchResult は /api/pages/:project/search/vector/titles のページ要素。
 *
 * exists: true のページは id・views・created・updated 等が付与される。
 * exists: false はタイトルは存在するが当プロジェクトに未作成のページ。
 */
export const VectorTitleSearchResultSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  image: z.string().nullable().optional(),
  /** ベクトル類似度スコア (0〜1、高いほど類似) */
  score: z.number(),
  exists: z.boolean().optional(),
  views: z.number().optional(),
  linked: z.number().optional(),
  created: z.number().optional(),
  updated: z.number().optional(),
  pageRank: z.number().optional(),
  linesCount: z.number().optional(),
  charsCount: z.number().optional(),
})
export type VectorTitleSearchResult = z.infer<typeof VectorTitleSearchResultSchema>

/** VectorSearchResult は /api/pages/:project/search/vector/titles のレスポンス全体。 */
export const VectorSearchResultSchema = z.object({
  pages: z.array(VectorTitleSearchResultSchema),
})
export type VectorSearchResult = z.infer<typeof VectorSearchResultSchema>
