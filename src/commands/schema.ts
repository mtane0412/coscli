/**
 * schema.ts — `cos schema` コマンド定義。
 *
 * コマンドツリー全体またはパス指定のコマンドのスキーマを JSON で出力する。
 * エージェントがコマンドを動的に探索・実行する際に使用する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  checkSandbox,
  commonArgs,
  exitWithError,
} from "@/commands/_shared"
import { getRootCommand } from "@/core/cli-root"
import { EXIT_NOT_FOUND } from "@/core/exit-codes"
import { buildSchema, findCommandByPath } from "@/core/schema"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** schemaCommand はコマンド/フラグのスキーマを JSON で出力するコマンド定義を返す。 */
export const schemaCommand = defineCommand({
  meta: { name: "schema", description: "コマンド/フラグのスキーマを JSON で出力する" },
  args: { ...commonArgs },
  async run({ args }) {
    const a = args as CommonArgs & { _?: string[] }
    checkSandbox("schema", a)
    // citty は positional を args 定義に書かなければ _ に残す
    const path = (a._ ?? []) as string[]

    const rootCmd = getRootCommand()
    const schema =
      path.length === 0
        ? await buildSchema(rootCmd, "cos")
        : await findCommandByPath(rootCmd, "cos", path)

    if (schema) {
      const startTime = Date.now()
      writeJson(schema, { command: "schema", startTime }, buildJsonOpts(a))
    } else {
      const cmdPath = path.join(" ")
      writeErrorJson(
        "UNKNOWN_COMMAND",
        `不明なコマンドです: ${cmdPath}`,
        "cos schema | jq '.subCommands[].name' で利用可能なコマンドを確認できます",
      )
      exitWithError(EXIT_NOT_FOUND, "UNKNOWN_COMMAND")
    }
  },
})
