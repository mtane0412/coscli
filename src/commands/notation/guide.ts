/**
 * notation/guide.ts — `cos notation` コマンド定義。
 *
 * Cosense 記法のリファレンスガイドを出力する。
 * エージェントが書き込み前に正しい記法を参照するための補助コマンド。
 *
 * 出力形式:
 *   引数なし    — トピック ID 一覧テーブル
 *   <topic>     — 該当セクションのみ出力 (テーブル / --json / --plain)
 *   --json      — 構造化 JSON envelope
 *   --plain     — TSV (syntax\tdescription)
 */

import {
  type CommonArgs,
  buildJsonOpts,
  checkSandbox,
  commonArgs,
  exitWithError,
} from "@/commands/_shared"
import { NOTATION_GUIDE, type NotationSection } from "@/core/notation/guide"
import { writeJson } from "@/presenter/json"
import { writePlainTable, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

/** buildSectionRows は NotationSection の items を rows 配列に変換する。 */
function buildSectionRows(section: NotationSection): string[][] {
  const rows: string[][] = []
  rows.push([`=== ${section.title} ===`, section.description ?? "", ""])
  for (const item of section.items) {
    rows.push([item.syntax, item.description, item.note ?? ""])
  }
  return rows
}

/** notationGuideCommand は Cosense 記法ガイドを出力するコマンド定義を返す。 */
export const notationGuideCommand = defineCommand({
  meta: { name: "notation", description: "Cosense 記法ガイドを出力する" },
  args: {
    ...commonArgs,
    topic: {
      type: "positional" as const,
      description: "記法トピック ID (省略時はトピック一覧を表示)",
      required: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { topic?: string }
    checkSandbox("notation", a)

    const topic = a.topic ?? ""

    // トピック指定あり: 該当セクションを返す
    if (topic !== "") {
      const section = NOTATION_GUIDE.sections.find((s) => s.id === topic)
      if (section === undefined) {
        const available = NOTATION_GUIDE.sections.map((s) => s.id).join(", ")
        process.stderr.write(`unknown topic: ${topic}. available: ${available}\n`)
        exitWithError(5, `unknown topic: ${topic}`)
      }

      if (a.json) {
        const startTime = Date.now()
        writeJson({ section }, { command: "notation", startTime }, buildJsonOpts(a))
        return
      }

      const headers = ["syntax", "description", "note"]
      if (a.plain) {
        // TSV モードではセクション見出し行を出力せず、items のみを行として渡す
        const rows = section.items.map((item) => [item.syntax, item.description, item.note ?? ""])
        writeTsv(headers, rows)
      } else {
        writePlainTable(headers, buildSectionRows(section))
      }
      return
    }

    // トピック指定なし: トピック一覧を返す
    const topics = NOTATION_GUIDE.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
    }))

    if (a.json) {
      const startTime = Date.now()
      writeJson({ topics }, { command: "notation", startTime }, buildJsonOpts(a))
      return
    }

    const headers = ["id", "title", "description"]
    const rows: string[][] = topics.map((t) => [t.id, t.title, t.description ?? ""])
    if (a.plain) {
      writeTsv(headers, rows)
    } else {
      writePlainTable(headers, rows)
    }
  },
})
