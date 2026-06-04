/**
 * edit-ops.ts — ユーザー向け ops フォーマットを Cosense v2 API の changes フォーマットに変換する。
 *
 * ユーザーは insertBefore / replace / delete の 3 種の op を JSON で指定する。
 * 内部では _insert / _update / _delete キーを使う changes 形式に変換して API に送信する。
 *
 * insertBefore の text に改行を含めると複数の _insert change に分割される。
 * replace の text に改行を含めるとエラーをスローする（API 制約）。
 */

import { randomBytes } from "node:crypto"
import type { RawChange } from "@/schemas/edit-v2"

/** TranslateResult は translateOps が返す変換結果。 */
export interface TranslateResult {
  /** API に送信する changes 配列。 */
  changes: RawChange[]
  /** insertBefore で新規生成した行 ID の集合。出力時のマーカー付与に使用する。 */
  newLineIds: Set<string>
  /** replace で更新した行 ID の集合。出力時のマーカー付与に使用する。 */
  updatedLineIds: Set<string>
}

/** defaultGenerateId はランダムな 24 文字 hex 文字列の行 ID を生成する。 */
export const defaultGenerateId = (): string => randomBytes(12).toString("hex")

/**
 * translateOps はユーザー向け ops 配列を API の changes 配列に変換した TranslateResult を返す。
 *
 * @param ops - stdin/ファイルから受け取った ops 配列（unknown 型で受け取り内部でバリデーション）
 * @param generateId - 行 ID 生成関数（デフォルト: randomBytes ベース。テストでは固定値を注入可）
 * @throws ops が配列でない場合、または各 op のキーが不正な場合
 */
export function translateOps(
  ops: unknown,
  generateId: () => string = defaultGenerateId,
): TranslateResult {
  if (!Array.isArray(ops)) {
    throw new Error("ops は配列である必要があります")
  }

  const changes: RawChange[] = []
  const newLineIds = new Set<string>()
  const updatedLineIds = new Set<string>()

  for (const op of ops) {
    if (!op || typeof op !== "object") {
      throw new Error("各 op はオブジェクトである必要があります")
    }

    const keys = Object.keys(op as Record<string, unknown>)
    const opKinds = ["insertBefore", "replace", "delete"].filter((k) => keys.includes(k))

    if (opKinds.length !== 1) {
      throw new Error(
        "各 op には insertBefore / replace / delete のいずれか 1 つだけを指定してください",
      )
    }

    const o = op as Record<string, unknown>

    if (opKinds[0] === "insertBefore") {
      const anchor = o["insertBefore"]
      const text = o["text"]
      if (typeof anchor !== "string") {
        throw new Error("insertBefore の値は文字列の行 ID である必要があります")
      }
      if (typeof text !== "string") {
        throw new Error("insertBefore.text は文字列である必要があります")
      }
      // 改行で分割して複数の _insert change に変換する
      for (const lineText of text.split(/\r?\n/)) {
        const id = generateId()
        changes.push({ _insert: anchor, lines: { id, text: lineText } })
        newLineIds.add(id)
      }
    } else if (opKinds[0] === "replace") {
      const lineId = o["replace"]
      const text = o["text"]
      if (typeof lineId !== "string") {
        throw new Error("replace の値は文字列の行 ID である必要があります")
      }
      if (typeof text !== "string") {
        throw new Error("replace.text は文字列である必要があります")
      }
      // API 制約: replace は単行のみ許可
      if (/\r?\n/.test(text)) {
        throw new Error(
          "replace は複数行テキストに対応していません。複数行に分割する場合は insertBefore で新規行を挿入してから元の行を delete してください",
        )
      }
      changes.push({ _update: lineId, lines: { text } })
      updatedLineIds.add(lineId)
    } else {
      // delete
      const lineId = o["delete"]
      if (typeof lineId !== "string") {
        throw new Error("delete の値は文字列の行 ID である必要があります")
      }
      changes.push({ _delete: lineId })
    }
  }

  return { changes, newLineIds, updatedLineIds }
}
