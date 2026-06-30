/**
 * page/table.ts — `cos page table <title> <filename>` コマンド。
 *
 * @deprecated `cos page get <title> --format=table --filename=<filename>` を使用してください。
 *
 * ページ内の [table:filename] ブロックを CSV テキストで取得して stdout に出力する。
 */

import { DEPRECATION_SINCE, warnDeprecated } from "@/commands/_deprecation"
import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  handleRestError,
  requireProject,
} from "@/commands/_shared"
import { getTable } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageTableCommand = defineCommand({
  meta: { name: "table", description: "ページ内のテーブルを CSV で取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    filename: {
      type: "positional",
      description: "テーブルのファイル名",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; filename: string }
    checkSandbox("page.table", a)
    const project = requireProject(a)
    const startTime = Date.now()

    const replacement = "page get <title> --format=table --filename=<filename>"
    const warnings: string[] = []
    warnDeprecated("page table", replacement, warnings)

    try {
      const client = await buildRestClient(a)
      const csv = await getTable(client, { project, title: a.title, filename: a.filename })

      if (a.json) {
        writeJson(
          { csv },
          {
            command: "page.table",
            startTime,
            warnings,
            canonicalCommand: "page.get",
            deprecated: { since: DEPRECATION_SINCE, replacement },
          },
          buildJsonOpts(a),
        )
        return
      }

      process.stdout.write(`${csv}\n`)
    } catch (err) {
      handleRestError(err, { resourceKind: "page", resourceName: a.title })
      throw err
    }
  },
})
