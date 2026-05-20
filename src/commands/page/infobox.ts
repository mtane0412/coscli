/**
 * page/infobox.ts — `cos page infobox <title>` コマンド。
 *
 * 指定したページの LLM 生成 infobox データ (infoboxResult) を取得して出力する。
 * --no-hallucination フラグで hallucination: true のアイテムを除外できる。
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
import { getPage } from "@/core/pages"
import { writeJson } from "@/presenter/json"
import type { InfoboxResultItem } from "@/schemas/page"
import { defineCommand } from "citty"

export const pageInfoboxCommand = defineCommand({
  meta: { name: "infobox", description: "LLM 生成 infobox データを取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    "no-hallucination": {
      type: "boolean",
      description: "hallucination: true のアイテムを除外する",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; "no-hallucination": boolean }
    checkSandbox("page.infobox", a)
    const project = requireProject(a)
    const startTime = Date.now()

    try {
      const client = await buildRestClient(a)
      const page = await getPage(client, { project, title: a.title })

      let items: InfoboxResultItem[] = page.infoboxResult ?? []
      if (a["no-hallucination"]) {
        items = items.filter((item) => !item.hallucination)
      }

      if (a.json || !a.plain) {
        writeJson(
          { infoboxResult: items },
          { command: "page.infobox", startTime },
          buildJsonOpts(a),
        )
        return
      }

      // プレーンテキスト: タイトル + Key-Value 形式で出力
      for (const item of items) {
        process.stdout.write(`=== ${item.title} ===\n`)
        for (const [key, value] of Object.entries(item.infobox)) {
          process.stdout.write(`  ${key}: ${value}\n`)
        }
        process.stdout.write("\n")
      }
    } catch (err) {
      handleRestError(err, { resourceKind: "page", resourceName: a.title })
      throw err
    }
  },
})
