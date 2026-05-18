/**
 * ws.ts — Cosense WebSocket 書き込みの薄いラッパー。
 *
 * @cosense/std の patch()/deletePage() を ScrapboxWriter interface でラップし、
 * --dry-run 対応と依存性注入 (テスト容易化) を提供する。
 *
 * 実際の WebSocket 接続は @cosense/std/websocket に委譲するため、
 * このファイルでは Socket.IO の詳細を扱わない。
 */

import type { Line } from "@/schemas/page"

/**
 * PatchMetadata は @cosense/std から update クロージャに渡されるページメタデータ。
 *
 * `commitId` は現在のページの最新コミット ID。`attempts` は retry 回数 (0 スタート)。
 */
export interface PatchMetadata {
  commitId?: string
  attempts: number
}

/** ScrapboxWriterStdClient は @cosense/std の API 関数群の interface。 */
export interface ScrapboxWriterStdClient {
  patch(
    project: string,
    title: string,
    update: (lines: Line[], metadata?: PatchMetadata) => Promise<string[]>,
    options?: { sid?: string; maxRetry?: number },
  ): Promise<{ commitId: string; pageId: string } | unknown>

  pin(
    project: string,
    title: string,
    options?: { sid?: string; create?: boolean },
  ): Promise<unknown>

  unpin(project: string, title: string, options?: { sid?: string }): Promise<unknown>
}

/** DryRunResult は --dry-run 時に実際のコミットをしないで返す結果型。 */
export interface DryRunResult {
  dryRun: true
  project: string
  title: string
  previewLines?: string[]
}

/** PatchOptions は patch() に渡すオプション。 */
export interface PatchOptions {
  project: string
  title: string
  /**
   * update は現在の行と @cosense/std から渡されるメタデータを受け取り、
   * 新しい行内容を返す。metadata.attempts > 0 は retry が発生したことを示す。
   */
  update: (lines: Line[], metadata?: PatchMetadata) => string[] | Promise<string[]>
  maxRetry?: number
  /** dry-run 時に出力するプレビュー行 (書き込み予定の内容)。 */
  previewLines?: string[]
}

/** InsertLinesOptions は insertLines() に渡すオプション。 */
export interface InsertLinesOptions {
  project: string
  title: string
  lines: string[]
  afterLineId?: string
}

/** DeletePageOptions は deletePage() に渡すオプション。 */
export interface DeletePageOptions {
  project: string
  title: string
}

/** PinPageOptions は pinPage() に渡すオプション。 */
export interface PinPageOptions {
  project: string
  title: string
  create?: boolean
}

/** UnpinPageOptions は unpinPage() に渡すオプション。 */
export interface UnpinPageOptions {
  project: string
  title: string
}

/** ScrapboxWriter は Cosense への書き込み操作を抽象化する interface。 */
export interface ScrapboxWriter {
  patch(opts: PatchOptions): Promise<{ commitId: string; pageId: string } | DryRunResult>

  insertLines(opts: InsertLinesOptions): Promise<{ commitId: string } | DryRunResult>

  deletePage(opts: DeletePageOptions): Promise<{ title: string } | DryRunResult>

  pinPage(opts: PinPageOptions): Promise<{ title: string } | DryRunResult>

  unpinPage(opts: UnpinPageOptions): Promise<{ title: string } | DryRunResult>
}

/** CosenseWriterOptions は CosenseWriter のオプション。 */
export interface CosenseWriterOptions {
  dryRun?: boolean
  sid?: string
  maxRetry?: number
}

/**
 * CosenseWriter は @cosense/std を使った ScrapboxWriter の本番実装。
 *
 * コンストラクタで stdClient を受け取ることで、テスト時にモックを注入できる。
 */
export class CosenseWriter implements ScrapboxWriter {
  constructor(
    private readonly stdClient: ScrapboxWriterStdClient,
    private readonly opts: CosenseWriterOptions = {},
  ) {}

  async patch(
    patchOpts: PatchOptions,
  ): Promise<{ commitId: string; pageId: string } | DryRunResult> {
    if (this.opts.dryRun) {
      const result: DryRunResult = {
        dryRun: true,
        project: patchOpts.project,
        title: patchOpts.title,
      }
      if (patchOpts.previewLines !== undefined) result.previewLines = patchOpts.previewLines
      return result
    }

    const patchOptions: { sid?: string; maxRetry?: number } = {}
    if (this.opts.sid !== undefined) patchOptions.sid = this.opts.sid
    const maxRetry = patchOpts.maxRetry ?? this.opts.maxRetry
    if (maxRetry !== undefined) patchOptions.maxRetry = maxRetry

    const result = await this.stdClient.patch(
      patchOpts.project,
      patchOpts.title,
      async (lines: Line[], metadata?: PatchMetadata) => {
        const updated = await patchOpts.update(lines, metadata)
        return updated
      },
      patchOptions,
    )

    // @cosense/std の Result 型から値を取り出す
    return result as { commitId: string; pageId: string }
  }

  async insertLines(opts: InsertLinesOptions): Promise<{ commitId: string } | DryRunResult> {
    if (this.opts.dryRun) {
      return { dryRun: true, project: opts.project, title: opts.title, previewLines: opts.lines }
    }

    // insertLines は patch の特殊ケース: 現在の末尾に行を追加する
    return this.patch({
      project: opts.project,
      title: opts.title,
      update: (lines: Line[]) => [...lines.map((l) => l.text), ...opts.lines],
    }) as Promise<{ commitId: string }>
  }

  async deletePage(opts: DeletePageOptions): Promise<{ title: string } | DryRunResult> {
    if (this.opts.dryRun) {
      return { dryRun: true, project: opts.project, title: opts.title }
    }

    // delete は update で空配列を返すことで実現する
    await this.patch({
      project: opts.project,
      title: opts.title,
      update: () => [],
    })
    return { title: opts.title }
  }

  async pinPage(opts: PinPageOptions): Promise<{ title: string } | DryRunResult> {
    if (this.opts.dryRun) {
      return { dryRun: true, project: opts.project, title: opts.title }
    }

    const pinOpts: { sid?: string; create?: boolean } = {}
    if (this.opts.sid !== undefined) pinOpts.sid = this.opts.sid
    if (opts.create !== undefined) pinOpts.create = opts.create
    await this.stdClient.pin(opts.project, opts.title, pinOpts)
    return { title: opts.title }
  }

  async unpinPage(opts: UnpinPageOptions): Promise<{ title: string } | DryRunResult> {
    if (this.opts.dryRun) {
      return { dryRun: true, project: opts.project, title: opts.title }
    }

    const unpinOpts: { sid?: string } = {}
    if (this.opts.sid !== undefined) unpinOpts.sid = this.opts.sid
    await this.stdClient.unpin(opts.project, opts.title, unpinOpts)
    return { title: opts.title }
  }
}

/**
 * DryRunWriter は常に dryRun: true を返す ScrapboxWriter の実装。
 *
 * --dry-run フラグが指定された時に使う。
 * 実際の WebSocket 接続を一切行わない。
 */
export class DryRunWriter implements ScrapboxWriter {
  async patch(opts: PatchOptions): Promise<DryRunResult> {
    const result: DryRunResult = { dryRun: true, project: opts.project, title: opts.title }
    if (opts.previewLines !== undefined) result.previewLines = opts.previewLines
    return result
  }

  async insertLines(opts: InsertLinesOptions): Promise<DryRunResult> {
    const result: DryRunResult = {
      dryRun: true,
      project: opts.project,
      title: opts.title,
      previewLines: opts.lines,
    }
    return result
  }

  async deletePage(opts: DeletePageOptions): Promise<DryRunResult> {
    return { dryRun: true, project: opts.project, title: opts.title }
  }

  async pinPage(opts: PinPageOptions): Promise<DryRunResult> {
    return { dryRun: true, project: opts.project, title: opts.title }
  }

  async unpinPage(opts: UnpinPageOptions): Promise<DryRunResult> {
    return { dryRun: true, project: opts.project, title: opts.title }
  }
}

/**
 * createScrapboxWriter は設定に応じた ScrapboxWriter を返すファクトリ。
 *
 * --dry-run フラグが指定された場合は DryRunWriter を返す。
 * そうでない場合は @cosense/std の patch 等を使った CosenseWriter を返す。
 */
export async function createScrapboxWriter(opts: {
  dryRun?: boolean
  sid: string
  maxRetry?: number
}): Promise<ScrapboxWriter> {
  if (opts.dryRun) return new DryRunWriter()

  // @cosense/std は動的 import で読み込み (バイナリサイズ最適化)
  const { patch, pin, unpin } = await import("@cosense/std/websocket")

  const stdClient: ScrapboxWriterStdClient = {
    patch: (project, title, update, options) =>
      patch(
        project,
        title,
        // @cosense/std の MakePatchFn は (BaseLine[], PatchMetadata) を渡す。
        // coscli 内部の update は (Line[], PatchMetadata?) を受け取るため、
        // metadata から commitId と attempts のみ抽出して渡す。
        (lines, metadata) =>
          update(
            lines as Line[],
            metadata ? { commitId: metadata.commitId, attempts: metadata.attempts } : undefined,
          ),
        {
          sid: options?.sid,
          retry: options?.maxRetry,
        } as Parameters<typeof patch>[3],
      ),
    pin: (project, title, options) => pin(project, title, options as Parameters<typeof pin>[2]),
    unpin: (project, title, options) =>
      unpin(project, title, options as Parameters<typeof unpin>[2]),
  }

  const writerOpts: CosenseWriterOptions = { sid: opts.sid }
  if (opts.maxRetry !== undefined) writerOpts.maxRetry = opts.maxRetry
  return new CosenseWriter(stdClient, writerOpts)
}
