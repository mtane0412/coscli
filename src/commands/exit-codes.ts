/**
 * exit-codes.ts — `cos exit-codes` コマンド定義。
 *
 * 終了コード一覧を機械可読形式 (JSON) またはテーブル形式で出力する。
 * エージェントがエラーハンドリングを実装する際の参照情報として使用する。
 */

import { type CommonArgs, buildJsonOpts, checkSandbox, commonArgs } from "@/commands/_shared"
import { EXIT_CODES } from "@/core/exit-codes"
import { writeJson } from "@/presenter/json"
import { writePlainTable, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

/** exitCodesCommand は終了コード一覧を出力するコマンド定義を返す。 */
export const exitCodesCommand = defineCommand({
  meta: { name: "exit-codes", description: "終了コード一覧を出力する" },
  args: { ...commonArgs },
  async run({ args }) {
    const a = args as CommonArgs
    checkSandbox("exit-codes", a)

    if (a.json) {
      const startTime = Date.now()
      writeJson([...EXIT_CODES], { command: "exit-codes", startTime }, buildJsonOpts(a))
      return
    }

    const headers = ["code", "name", "description"]
    const rows = EXIT_CODES.map((e) => [String(e.code), e.name, e.description])

    if (a.plain) {
      writeTsv(headers, rows)
    } else {
      writePlainTable(headers, rows)
    }
  },
})
