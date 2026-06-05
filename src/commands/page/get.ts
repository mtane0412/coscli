/**
 * page/get.ts — `cos page get <title>` コマンド。
 *
 * 指定したタイトルのページ詳細 (行データ、メタ情報) を取得して出力する。
 * --format ai を指定すると、メタデータ・テロメア・本文・1-hop 関連ページを
 * エージェントが読みやすい Markdown 形式でワンショット出力する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  requireProject,
} from "@/commands/_shared"
import { formatAiPage } from "@/core/format/ai-page"
import { getPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** --format に指定できる有効な値 */
const VALID_FORMATS = ["ai"] as const

export const pageGetCommand = defineCommand({
  meta: { name: "get", description: "ページ詳細を取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    format: {
      type: "string",
      description: "出力フォーマット (ai)。ai はエージェント向け Markdown 形式で出力する",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; format?: string }
    checkSandbox("page.get", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --format バリデーション
    if (a.format !== undefined && !(VALID_FORMATS as readonly string[]).includes(a.format)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--format=${a.format} は無効な値です`,
        `有効な値: ${VALID_FORMATS.join(", ")}`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    // --format ai と --json の排他制御
    if (a.format === "ai" && a.json) {
      writeErrorJson(
        "VALIDATION_ERROR",
        "--format=ai と --json は同時に指定できません",
        "--format=ai は Markdown 形式で出力するため JSON envelope は不要です",
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    const client = await buildRestClient(a)

    if (a.format === "ai") {
      // getPage と getProjectMembers を並列フェッチして遅延を抑える
      const [page, members] = await Promise.all([
        getPage(client, { project, title: a.title }),
        client.getProjectMembers(project).catch(() => null),
      ])
      const markdown = formatAiPage(page, members)
      process.stdout.write(markdown)
      return
    }

    const page = await getPage(client, { project, title: a.title })

    if (a.json || !a.plain) {
      writeJson(page, { command: "page.get", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${page.title}\n`)
    for (const line of page.lines) {
      process.stdout.write(`${line.text}\n`)
    }
  },
})
