/**
 * pages.ts — ページ操作のユースケース層。
 *
 * REST 読み取りと WebSocket 書き込みを統合し、
 * コマンド実装から直接呼び出せるシンプルな関数を提供する。
 */

import type { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import { PageLineError } from "@/core/errors"

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

/** getSmartContext はページ起点の Smart Context テキストを取得する。 */
export async function getSmartContext(
  client: CosenseRestClient,
  opts: { project: string; title: string; hops: 1 | 2 },
) {
  return client.getSmartContext(opts.project, opts.title, opts.hops)
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
    previewLines: opts.lines,
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
    previewLines: opts.lines,
  })
}

/** deletePage はページを削除する (WebSocket commit)。 */
export async function deletePage(writer: ScrapboxWriter, opts: { project: string; title: string }) {
  return writer.deletePage({ project: opts.project, title: opts.title })
}

/** renamePage はページタイトルを変更する (WebSocket commit)。lines[0] を書き換えると TitleChange が自動 emit される。 */
export async function renamePage(
  writer: ScrapboxWriter,
  opts: { project: string; title: string; newTitle: string },
) {
  return writer.patch({
    project: opts.project,
    title: opts.title,
    update: (lines) => [opts.newTitle, ...lines.slice(1).map((l) => l.text)],
    previewLines: [opts.newTitle],
  })
}

/** prependToPage はタイトル直後に行を挿入する (WebSocket commit)。 */
export async function prependToPage(
  writer: ScrapboxWriter,
  opts: { project: string; title: string; lines: string[] },
) {
  return writer.patch({
    project: opts.project,
    title: opts.title,
    update: (existing) => [
      existing[0]?.text ?? opts.title,
      ...opts.lines,
      ...existing.slice(1).map((l) => l.text),
    ],
    previewLines: opts.lines,
  })
}

/**
 * insertIntoPage は指定行 (1-indexed) の後ろに行を挿入する (WebSocket commit)。
 * after が範囲外の場合は update 関数内で Error を throw する。
 */
export async function insertIntoPage(
  writer: ScrapboxWriter,
  opts: { project: string; title: string; after: number; lines: string[] },
) {
  return writer.patch({
    project: opts.project,
    title: opts.title,
    update: (existing) => {
      if (!Number.isInteger(opts.after) || opts.after < 1 || opts.after > existing.length) {
        throw new Error(`--after の値が範囲外です (1〜${existing.length} の整数を指定してください)`)
      }
      const txt = existing.map((l) => l.text)
      return [...txt.slice(0, opts.after), ...opts.lines, ...txt.slice(opts.after)]
    },
    previewLines: opts.lines,
  })
}

/**
 * replaceLinesInPage は指定行範囲を新しい内容で置換する (WebSocket commit)。
 *
 * start / end は 1-indexed で両端含む。タイトル行 (start=1) は保護。
 * end > existing.length の場合は update 関数内で Error を throw する。
 */
export async function replaceLinesInPage(
  writer: ScrapboxWriter,
  opts: {
    project: string
    title: string
    start: number
    end: number
    lines: string[]
    previewLines?: string[]
  },
) {
  return writer.patch({
    project: opts.project,
    title: opts.title,
    update: (existing) => {
      if (opts.start < 2) {
        throw new PageLineError("タイトル行は編集できません (start は 2 以上を指定してください)")
      }
      if (opts.start > opts.end) {
        throw new PageLineError(
          `--range/--line の値が不正です (start <= end を満たしてください: start=${opts.start}, end=${opts.end})`,
        )
      }
      if (opts.end > existing.length) {
        throw new PageLineError(
          `--range/--line の値が範囲外です (1〜${existing.length} の行が存在します)`,
        )
      }
      return [
        existing[0]?.text ?? opts.title,
        ...existing.slice(1, opts.start - 1).map((l) => l.text),
        ...opts.lines,
        ...existing.slice(opts.end).map((l) => l.text),
      ]
    },
    ...(opts.previewLines !== undefined && { previewLines: opts.previewLines }),
  })
}

/**
 * deleteLinesFromPage は指定行範囲を削除する (WebSocket commit)。
 *
 * start / end は 1-indexed で両端含む。タイトル行 (start=1) は保護。
 * end > existing.length の場合は update 関数内で Error を throw する。
 */
export async function deleteLinesFromPage(
  writer: ScrapboxWriter,
  opts: { project: string; title: string; start: number; end: number },
) {
  return writer.patch({
    project: opts.project,
    title: opts.title,
    update: (existing) => {
      if (opts.start < 2) {
        throw new PageLineError("タイトル行は編集できません (start は 2 以上を指定してください)")
      }
      if (opts.start > opts.end) {
        throw new PageLineError(
          `--range/--line の値が不正です (start <= end を満たしてください: start=${opts.start}, end=${opts.end})`,
        )
      }
      if (opts.end > existing.length) {
        throw new PageLineError(
          `--range/--line の値が範囲外です (1〜${existing.length} の行が存在します)`,
        )
      }
      return [
        existing[0]?.text ?? opts.title,
        ...existing.slice(1, opts.start - 1).map((l) => l.text),
        ...existing.slice(opts.end).map((l) => l.text),
      ]
    },
  })
}

/** pinPage はページをピン留めする (WebSocket commit)。 */
export async function pinPage(
  writer: ScrapboxWriter,
  opts: { project: string; title: string; create: boolean },
) {
  return writer.pinPage({ project: opts.project, title: opts.title, create: opts.create })
}

/** unpinPage はピン留めを解除する (WebSocket commit)。 */
export async function unpinPage(writer: ScrapboxWriter, opts: { project: string; title: string }) {
  return writer.unpinPage({ project: opts.project, title: opts.title })
}
