/**
 * notation/guide.ts — `cos notation` コマンド定義。
 *
 * Cosense 記法のリファレンスガイドを出力する。
 * エージェントが書き込み前に正しい記法を参照するための補助コマンド。
 *
 * 出力形式:
 *   デフォルト  — ヒューマンリーダブルなテーブル
 *   --json      — 構造化 JSON envelope
 *   --plain     — TSV (syntax\tdescription)
 */

import { type CommonArgs, buildJsonOpts, checkSandbox, commonArgs } from "@/commands/_shared"
import { NOTATION_GUIDE } from "@/core/notation/guide"
import { writeJson } from "@/presenter/json"
import { writePlainTable, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

/** notationGuideCommand は Cosense 記法ガイドを出力するコマンド定義を返す。 */
export const notationGuideCommand = defineCommand({
  meta: { name: "notation", description: "Cosense 記法ガイドを出力する" },
  args: { ...commonArgs },
  async run({ args }) {
    const a = args as CommonArgs
    checkSandbox("notation", a)

    if (a.json) {
      const startTime = Date.now()
      writeJson(NOTATION_GUIDE, { command: "notation", startTime }, buildJsonOpts(a))
      return
    }

    // テーブル / TSV 出力: 全セクションのアイテムをフラット化して表示する
    const headers = ["syntax", "description", "note"]
    const rows: string[][] = []

    for (const section of NOTATION_GUIDE.sections) {
      // セクションヘッダ行 (空行で区切る)
      if (rows.length > 0) {
        rows.push(["", "", ""])
      }
      rows.push([`=== ${section.title} ===`, section.description ?? "", ""])
      for (const item of section.items) {
        rows.push([item.syntax, item.description, item.note ?? ""])
      }
    }

    // tips セクション
    if (NOTATION_GUIDE.tips.length > 0) {
      rows.push(["", "", ""])
      rows.push(["=== 注意事項 ===", "", ""])
      for (const tip of NOTATION_GUIDE.tips) {
        rows.push(["", tip, ""])
      }
    }

    if (a.plain) {
      writeTsv(headers, rows)
    } else {
      writePlainTable(headers, rows)
    }
  },
})
