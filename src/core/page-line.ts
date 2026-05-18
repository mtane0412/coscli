/**
 * page-line.ts — ページの行取得 (読み取り専用)。
 *
 * `getLineRange` は REST 経由でページを取得し、指定行範囲 (1-indexed) の
 * 行データのみを返す。書き込みは行わない。
 */

import type { CosenseRestClient } from "@/core/api/rest"
import type { Line } from "@/schemas/page"

/**
 * getLineRange は REST 経由でページを取得し、指定行範囲の Line[] を返す。
 *
 * @param client - REST クライアント
 * @param opts.start - 開始行 (1-indexed)
 * @param opts.end - 終了行 (1-indexed, 両端含む)
 * @returns { start, end, lines } — 指定範囲の行データ
 * @throws Error end > ページ行数 の場合
 * @throws NotFoundError ページが存在しない場合
 * @remarks start <= end は parseLineSpec により呼び出し側で保証される前提。
 *   end チェックで start の範囲外も間接的にカバーされる。
 */
export async function getLineRange(
  client: CosenseRestClient,
  opts: { project: string; title: string; start: number; end: number },
): Promise<{ start: number; end: number; lines: Line[] }> {
  const page = await client.getPage(opts.project, opts.title)

  if (
    !Number.isInteger(opts.start) ||
    !Number.isInteger(opts.end) ||
    opts.start < 1 ||
    opts.start > opts.end
  ) {
    throw new Error(
      `--range/--line の値が不正です (1以上の整数で start <= end を満たしてください: start=${opts.start}, end=${opts.end})`,
    )
  }
  if (opts.end > page.lines.length) {
    throw new Error(`--range/--line の値が範囲外です (ページの行数は ${page.lines.length} です)`)
  }

  // slice は 0-indexed のため start-1 から end まで (end は exclusive)
  const lines = page.lines.slice(opts.start - 1, opts.end)

  return { start: opts.start, end: opts.end, lines }
}
