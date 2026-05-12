/**
 * page/context.ts — `cos page context <title>` コマンド。
 *
 * 指定ページを起点に Smart Context API を叩き、
 * 1hop または 2hop 先までのリンク先ページ本文をテキストで取得して stdout に出力する。
 * LLM への文脈投入やエージェントによるページ関連情報収集に使う。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { getSmartContext } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** 有効な hops 値 */
const VALID_HOPS = [1, 2] as const
type Hops = (typeof VALID_HOPS)[number]

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
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; hops: string }
    checkSandbox("page.context", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --hops バリデーション
    const hopsNum = Number(a.hops)
    if (!(VALID_HOPS as readonly number[]).includes(hopsNum)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--hops=${a.hops} は無効な値です`,
        `有効な値: ${VALID_HOPS.join(", ")}`,
      )
      process.exit(5)
      // process.exit がモックされるテスト環境でも後続処理を止める (_shared.ts exitWithError と同パターン)
      throw new Error("VALIDATION_ERROR")
    }
    const hops = hopsNum as Hops

    logger.info(`"${a.title}" の Smart Context (${hops}hop) を取得中...`)

    const client = await buildRestClient(a)
    const text = await getSmartContext(client, { project, title: a.title, hops })

    if (a.json) {
      writeJson({ text }, { command: "page.context", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${text}\n`)
  },
})
