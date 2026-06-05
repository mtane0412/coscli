/**
 * edit-v2.ts — v2 AI ops API 向けの change 構築ヘルパー。
 *
 * コマンドレベルの入力（行テキスト配列・lineId・タイトル等）を受け取り、
 * `previewEditV2` に渡す TranslateResult を組み立てる。
 * 内部では `translateOps` を呼んで RawChange 配列を生成する。
 *
 * buildPreviewResult は previewEditV2 レスポンスから出力用データ構造を組み立てる。
 * 複数の preview コマンドで共有するために `src/commands/page/edit/preview.ts` から抽出した。
 */

import { defaultGenerateId, translateOps } from "@/core/edit-ops"
import type { TranslateResult } from "@/core/edit-ops"
import type { PagePreview } from "@/schemas/edit-v2"

export type { TranslateResult }

/**
 * buildAppendChanges はテキスト行配列を末尾追加用の TranslateResult に変換する。
 *
 * 各行に `insertBefore: "_end"` の op を生成する。
 */
export function buildAppendChanges(
  lines: string[],
  generateId: () => string = defaultGenerateId,
): TranslateResult {
  if (lines.length === 0) {
    return { changes: [], newLineIds: new Set(), updatedLineIds: new Set() }
  }
  const ops = lines.map((line) => ({ insertBefore: "_end" as const, text: line }))
  return translateOps(ops, generateId)
}

/**
 * buildPrependChanges は指定アンカー行の直前にテキスト行配列を挿入する TranslateResult を返す。
 *
 * anchorLineId にはタイトル直後の行 ID を渡す。タイトル行しか存在しない場合は "_end" を渡す。
 */
export function buildPrependChanges(
  anchorLineId: string,
  lines: string[],
  generateId: () => string = defaultGenerateId,
): TranslateResult {
  if (lines.length === 0) {
    return { changes: [], newLineIds: new Set(), updatedLineIds: new Set() }
  }
  const ops = lines.map((line) => ({ insertBefore: anchorLineId, text: line }))
  return translateOps(ops, generateId)
}

/**
 * buildInsertChanges は指定アンカー行の直前にテキスト行配列を挿入する TranslateResult を返す。
 *
 * anchorLineId には挿入先の次行の ID を渡す。最終行に挿入する場合は "_end" を渡す。
 */
export function buildInsertChanges(
  anchorLineId: string,
  lines: string[],
  generateId: () => string = defaultGenerateId,
): TranslateResult {
  if (lines.length === 0) {
    return { changes: [], newLineIds: new Set(), updatedLineIds: new Set() }
  }
  const ops = lines.map((line) => ({ insertBefore: anchorLineId, text: line }))
  return translateOps(ops, generateId)
}

/**
 * buildReplaceChanges は指定 lineId の行テキストを置換する TranslateResult を返す。
 *
 * text に改行が含まれる場合はエラーをスローする（v2 API 制約）。
 */
export function buildReplaceChanges(lineId: string, text: string): TranslateResult {
  return translateOps([{ replace: lineId, text }])
}

/**
 * buildDeleteChanges は指定 lineId 配列の行を削除する TranslateResult を返す。
 */
export function buildDeleteChanges(lineIds: string[]): TranslateResult {
  if (lineIds.length === 0) {
    return { changes: [], newLineIds: new Set(), updatedLineIds: new Set() }
  }
  const ops = lineIds.map((id) => ({ delete: id }))
  return translateOps(ops)
}

/**
 * buildNewPageChanges はタイトルと本文行配列から新規ページ作成用の TranslateResult を返す。
 *
 * タイトル行を先頭に、本文行を続けて `insertBefore: "_end"` の op を生成する。
 */
export function buildNewPageChanges(
  title: string,
  body: string[],
  generateId: () => string = defaultGenerateId,
): TranslateResult {
  const allLines = [title, ...body]
  const ops = allLines.map((line) => ({ insertBefore: "_end" as const, text: line }))
  return translateOps(ops, generateId)
}

/** PreviewResultLine は buildPreviewResult が返す行情報。 */
export interface PreviewResultLine {
  id: string
  text: string
  marker: "new" | "updated" | null
}

/** PreviewResult は buildPreviewResult が返す出力用データ構造。 */
export interface PreviewResult {
  previewId: string
  expireAt: string
  status: "create" | "update"
  title: string
  lines: PreviewResultLine[]
}

/**
 * buildPreviewResult は previewEditV2 レスポンスから出力用のデータ構造を組み立てる。
 *
 * idSets に newLineIds / updatedLineIds を渡すと各行に marker を付与する。
 * idSets が空配列の場合は marker なし（すべて null）になる。
 */
export function buildPreviewResult(
  previewId: string,
  expireAt: string,
  status: "create" | "update",
  title: string,
  pagePreview: PagePreview,
  idSets: [Set<string>, Set<string>] | [],
): PreviewResult {
  const [newLineIds, updatedLineIds] =
    idSets.length === 2 ? idSets : [new Set<string>(), new Set<string>()]

  const lines = (pagePreview?.lines ?? []).map((line) => ({
    id: line.id,
    text: line.text,
    marker: newLineIds.has(line.id)
      ? ("new" as const)
      : updatedLineIds.has(line.id)
        ? ("updated" as const)
        : null,
  }))

  return { previewId, expireAt, status, title, lines }
}
