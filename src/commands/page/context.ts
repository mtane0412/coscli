/**
 * page/context.ts — `cos page context <title>` コマンド。
 *
 * @deprecated `cos page get <title> --format=context` を使用してください。
 *
 * 指定ページを起点に Smart Context API を叩き、
 * 1hop または 2hop 先までのリンク先ページ本文をテキストで取得して stdout に出力する。
 * LLM への文脈投入やエージェントによるページ関連情報収集に使う。
 * --query を指定すると、ページセクション単位でキーワードフィルタを行う。
 */

import { DEPRECATION_SINCE, warnDeprecated } from "@/commands/_deprecation"
import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  requireProject,
} from "@/commands/_shared"
import { filterSmartContextByQuery } from "@/core/format/page-format"
import { getSmartContext } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** 有効な hops 値 */
const VALID_HOPS = [1, 2] as const
type Hops = (typeof VALID_HOPS)[number]

export { filterSmartContextByQuery }

export const pageContextCommand = defineCommand({
  meta: { name: "context", description: "ページ起点の Smart Context (リンク先本文) を取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "起点となるページタイトル",
      required: true,
    },
    hops: {
      type: "string",
      description: "取得するリンクの深さ (1 | 2)。デフォルト: 1",
      default: "1",
    },
    query: {
      type: "string",
      description: "hop 近傍ページを本文キーワードで絞り込む",
      default: "",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; hops: string; query: string }
    checkSandbox("page.context", a)
    const project = requireProject(a)
    const startTime = Date.now()

    const warnings: string[] = []
    warnDeprecated("page context", "page get --format=context", warnings)

    // --hops バリデーション
    const hopsNum = Number(a.hops)
    if (!(VALID_HOPS as readonly number[]).includes(hopsNum)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--hops=${a.hops} は無効な値です`,
        `有効な値: ${VALID_HOPS.join(", ")}`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }
    const hops = hopsNum as Hops

    const client = await buildRestClient(a)
    const rawText = await getSmartContext(client, { project, title: a.title, hops })
    const text = filterSmartContextByQuery(rawText, a.query)

    if (a.json) {
      writeJson(
        { text },
        {
          command: "page.context",
          startTime,
          warnings,
          canonicalCommand: "page.get",
          deprecated: { since: DEPRECATION_SINCE, replacement: "page get --format=context" },
        },
        buildJsonOpts(a),
      )
      return
    }

    if (text) {
      process.stdout.write(`${text}\n`)
    }
  },
})
