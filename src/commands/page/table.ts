/**
 * page/table.ts — `cos page table <title> <filename>` コマンド。
 *
 * ページ内の [table:filename] ブロックを CSV テキストで取得して stdout に出力する。
 */

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

    try {
      const client = await buildRestClient(a)
      const csv = await getTable(client, { project, title: a.title, filename: a.filename })

      if (a.json) {
        writeJson({ csv }, { command: "page.table", startTime }, buildJsonOpts(a))
        return
      }

      process.stdout.write(`${csv}\n`)
    } catch (err) {
      handleRestError(err, { resourceKind: "page", resourceName: a.title })
      throw err
    }
  },
})
