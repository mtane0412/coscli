/**
 * schema.ts — `cos schema` コマンド定義。
 *
 * コマンドツリー全体またはパス指定のコマンドのスキーマを JSON で出力する。
 * エージェントがコマンドを動的に探索・実行する際に使用する。
 */

import { type CommonArgs, buildJsonOpts, commonArgs } from "@/commands/_shared"
import { getRootCommand } from "@/core/cli-root"
import { EXIT_NOT_FOUND } from "@/core/exit-codes"
import { buildSchema, findCommandByPath } from "@/core/schema"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const schemaCommand = defineCommand({
  meta: { name: "schema", description: "コマンド/フラグのスキーマを JSON で出力する" },
  args: { ...commonArgs },
  async run({ args }) {
    const a = args as CommonArgs & { _?: string[] }
    // citty は positional を args 定義に書かなければ _ に残す
    const path = (a._ ?? []) as string[]
    const startTime = Date.now()

    const rootCmd = getRootCommand()
    const schema =
      path.length === 0
        ? await buildSchema(rootCmd, "cos")
        : await findCommandByPath(rootCmd, "cos", path)

    if (!schema) {
      const cmdPath = path.join(" ")
      writeErrorJson(
        "UNKNOWN_COMMAND",
        `unknown command: ${cmdPath}`,
        "cos schema | jq '.subCommands[].name' で利用可能なコマンドを確認できます",
      )
      process.exit(EXIT_NOT_FOUND)
      return
    }

    writeJson(schema, { command: "schema", startTime }, buildJsonOpts(a))
  },
})
