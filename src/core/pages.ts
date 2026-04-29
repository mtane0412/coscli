/**
 * pages.ts — ページ操作のユースケース層。
 *
 * REST 読み取りと WebSocket 書き込みを統合し、
 * コマンド実装から直接呼び出せるシンプルな関数を提供する。
 */

import type { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"

/** listPages はプロジェクトのページ一覧を取得する。 */
export async function listPages(
  client: CosenseRestClient,
  opts: { project: string; limit?: number; skip?: number; sort?: string },
) {
  const { project, ...restOpts } = opts
  return client.listPages(project, restOpts)
}

/** getPage は指定タイトルのページ詳細を取得する。 */
export async function getPage(client: CosenseRestClient, opts: { project: string; title: string }) {
  return client.getPage(opts.project, opts.title)
}

/** getPageText はページのテキスト本文を取得する。 */
export async function getPageText(
  client: CosenseRestClient,
  opts: { project: string; title: string },
) {
  return client.getPageText(opts.project, opts.title)
}

/** getCodeBlock はページ内のコードブロックを取得する。 */
export async function getCodeBlock(
  client: CosenseRestClient,
  opts: { project: string; title: string; filename: string },
) {
  return client.getCodeBlock(opts.project, opts.title, opts.filename)
}

/** createPage は新規ページを作成する (WebSocket commit)。 */
export async function createPage(
  writer: ScrapboxWriter,
  opts: { project: string; title: string; lines: string[] },
) {
  return writer.patch({
    project: opts.project,
    title: opts.title,
    update: () => [opts.title, ...opts.lines],
  })
}

/** appendToPage はページ末尾に行を追加する (WebSocket commit)。 */
export async function appendToPage(
  writer: ScrapboxWriter,
  opts: { project: string; title: string; lines: string[] },
) {
  return writer.insertLines({
    project: opts.project,
    title: opts.title,
    lines: opts.lines,
  })
}

/** editPage はページの内容を全置換する (WebSocket commit)。 */
export async function editPage(
  writer: ScrapboxWriter,
  opts: { project: string; title: string; lines: string[] },
) {
  return writer.patch({
    project: opts.project,
    title: opts.title,
    update: () => [opts.title, ...opts.lines],
  })
}

/** deletePage はページを削除する (WebSocket commit)。 */
export async function deletePage(writer: ScrapboxWriter, opts: { project: string; title: string }) {
  return writer.deletePage({ project: opts.project, title: opts.title })
}
