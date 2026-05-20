/**
 * pages.ts — ページ操作のユースケース層。
 *
 * REST 読み取りと WebSocket 書き込みを統合し、
 * コマンド実装から直接呼び出せるシンプルな関数を提供する。
 */

import type { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import { CommitConflictError, PageLineError } from "@/core/errors"

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

/** getTable はページ内のテーブルを CSV テキストで返す。 */
export async function getTable(
  client: CosenseRestClient,
  opts: { project: string; title: string; filename: string },
) {
  return client.getTable(opts.project, opts.title, opts.filename)
}

/** getPageCommits はページのコミット履歴を返す。 */
export async function getPageCommits(
  client: CosenseRestClient,
  opts: { project: string; pageId: string; head?: string },
) {
  const { project, pageId, head } = opts
  return client.getCommits(project, pageId, head !== undefined ? { head } : {})
}

/** getPageSnapshotList はページのスナップショット一覧 (timestamp ID 群) を返す。 */
export async function getPageSnapshotList(
  client: CosenseRestClient,
  opts: { project: string; pageId: string },
) {
  return client.getSnapshotList(opts.project, opts.pageId)
}

/** getPageSnapshot は指定 timestampId のスナップショット詳細を返す。 */
export async function getPageSnapshot(
  client: CosenseRestClient,
  opts: { project: string; pageId: string; timestampId: string },
) {
  return client.getSnapshot(opts.project, opts.pageId, opts.timestampId)
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

/**
 * editPage はページの内容を全置換する (WebSocket commit)。
 *
 * デフォルトで楽観ロックを有効化する。`metadata.attempts > 0` は @cosense/std が
 * リトライを発生させたことを示し、他者の編集と競合したとみなして CommitConflictError を throw する。
 * `--force` を指定すると楽観ロックを無効化して上書きを許可する。
 * `expectCommitId` を指定すると、サーバーの現在の commitId と一致しない場合も CommitConflictError を throw する。
 */
export async function editPage(
  writer: ScrapboxWriter,
  opts: {
    project: string
    title: string
    lines: string[]
    /** true の場合、楽観ロックを無効化して上書きを許可する。 */
    force?: boolean
    /** 期待する commitId。サーバーの値と不一致の場合に CommitConflictError を throw する。 */
    expectCommitId?: string
  },
) {
  return writer.patch({
    project: opts.project,
    title: opts.title,
    update: (_existing, meta) => {
      if (!opts.force) {
        // リトライが発生した = 他者がページを更新した
        if (meta && meta.attempts > 0) {
          throw new CommitConflictError(
            `編集中に他者がページを更新しました (attempts=${meta.attempts})`,
          )
        }
        // 明示的な commitId チェック
        if (opts.expectCommitId && meta?.commitId && meta.commitId !== opts.expectCommitId) {
          throw new CommitConflictError(
            `期待 commit ${opts.expectCommitId} と現在 ${meta.commitId} が異なります`,
            opts.expectCommitId,
            meta.commitId,
          )
        }
      }
      return [opts.title, ...opts.lines]
    },
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

/** INFOBOX_TABLE_HEADERS は infobox 定義として有効なテーブルヘッダ名。 */
const INFOBOX_TABLE_HEADERS = new Set(["table:infobox", "table:cosense"])

/**
 * findInfoboxPages は table:infobox または table:cosense を持つページ一覧を返す。
 *
 * 2クエリ（table:infobox / table:cosense）を並列検索してマージし、id で重複除去する。
 * 検索結果の lines フィールドを検証し、以下の誤ヒットを除外する:
 * - タイトルが "table:infobox" / "table:cosense" のページ（記法説明ページなど）
 * - インラインコード記法（`table:infobox`）で言及するだけのページ
 * limit 指定時はフィルタリング後に最終切り詰めを行う。
 */
export async function findInfoboxPages(
  client: CosenseRestClient,
  opts: { project: string; limit?: number },
) {
  const { project, limit } = opts
  const [infoboxResult, cosenseResult] = await Promise.all([
    client.searchPages(project, "table:infobox"),
    client.searchPages(project, "table:cosense"),
  ])

  // id をキーに Map へ追加することで重複を除去する
  const seen = new Map<string, (typeof infoboxResult.pages)[number]>()
  for (const page of [...infoboxResult.pages, ...cosenseResult.pages]) {
    if (!seen.has(page.id)) {
      seen.set(page.id, page)
    }
  }

  // lines にテーブルヘッダ行が含まれるページのみ残す
  // タイトル行がヒットしただけのページ（例: タイトルが "table:infobox" のページ）は除外する
  const pages = [...seen.values()].filter((page) =>
    page.lines?.some((line) => INFOBOX_TABLE_HEADERS.has(line) && line !== page.title),
  )

  return limit !== undefined ? pages.slice(0, limit) : pages
}
