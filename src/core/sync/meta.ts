/**
 * meta.ts — 同期メタデータのスキーマ定義と読み書きユーティリティ。
 *
 * pull 時に commitId・contentSha256 等を <dir>/.coscli/<project>/<title>.json に保存し、
 * push/diff 時の競合検出とローカル変更有無の判定に使う。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"

/** SyncMetaSchema は同期メタデータの zod スキーマ。 */
export const SyncMetaSchema = z.object({
  schemaVersion: z.literal(1),
  project: z.string(),
  /** title は生のページタイトル (ファイル名と一致するが、メタ側を正として扱う) */
  title: z.string(),
  pageId: z.string(),
  /** commitId は pull 時点のサーバ最新コミット ID (楽観ロック判定用) */
  commitId: z.string(),
  lastPulledAt: z.number(),
  format: z.enum(["txt"]),
  /** contentSha256 は pull 直後のローカル本文ハッシュ (push 時にローカル変更検出に使う) */
  contentSha256: z.string(),
})

export type SyncMeta = z.infer<typeof SyncMetaSchema>

/** metaFilePath はメタファイルのパスを返す。 */
function metaFilePath(syncDir: string, project: string, title: string): string {
  return join(syncDir, ".coscli", project, `${title}.json`)
}

/** writeMeta はメタデータをファイルに書き込む。中間ディレクトリは自動作成する。 */
export function writeMeta(syncDir: string, meta: SyncMeta): void {
  const filePath = metaFilePath(syncDir, meta.project, meta.title)
  const dir = join(syncDir, ".coscli", meta.project)
  // recursive: true は冪等のため existsSync による事前チェック不要
  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, JSON.stringify(meta, null, 2), { mode: 0o600 })
}

/** readMeta はメタデータをファイルから読み込む。ファイルが存在しない場合は null を返す。破損時は Error を throw する。 */
export function readMeta(syncDir: string, project: string, title: string): SyncMeta | null {
  const filePath = metaFilePath(syncDir, project, title)
  try {
    const raw = readFileSync(filePath, "utf-8")
    return SyncMetaSchema.parse(JSON.parse(raw) as unknown)
  } catch (err) {
    // ENOENT はファイル未作成の正常ケース (existsSync は Linux bun で誤検知があるため使わない)
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw new Error(
      `メタデータファイルの読み込みに失敗しました: ${filePath}\n${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
