/**
 * page/rename.ts — `cos page rename <title> <new-title>` コマンド。
 *
 * ページタイトルを変更する。WebSocket commit で lines[0] を書き換えることで
 * @cosense/std が TitleChange を自動 emit する。
 *
 * --force-fallback なし時は変更前に新タイトルの重複チェックを行い、
 * 重複する場合は DUPLICATE_TITLE エラー (exit 5) で終了する。
 */

import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  requireProject,
} from "@/commands/_shared"
import { renamePage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageRenameCommand = defineCommand({
  meta: { name: "rename", description: "ページタイトルを変更する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
    title: {
      type: "positional",
      description: "変更前のページタイトル",
      required: true,
    },
    "new-title": {
      type: "positional",
      description: "変更後のページタイトル",
      required: true,
    },
    "force-fallback": {
      type: "boolean",
      description: "重複タイトル時に @cosense/std の suggestUnDupTitle による自動補正を許可する",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs & {
      title: string
      "new-title": string
      "force-fallback": boolean
    }
    checkSandbox("page.rename", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // dry-run 以外かつ同名でない場合は重複チェックを行う (同名は no-op なのでスキップ)
    if (!a["dry-run"] && !a["force-fallback"] && a["new-title"] !== a.title) {
      const client = await buildRestClient(a)
      try {
        const page = await client.getPage(project, a["new-title"])
        // persistent:true の場合のみ実体ページが存在するとみなす。
        // Cosense REST API は存在しないページに persistent:false のスタブとして 200 を返すため、
        // getPage の成功だけでは重複の証明にならない。(issue #57)
        if (page.persistent === true) {
          writeErrorJson(
            "DUPLICATE_TITLE",
            `"${a["new-title"]}" は既に存在します`,
            "別のタイトルを指定するか、--force-fallback を使用してください",
          )
          process.exit(5)
        }
      } catch (err) {
        // 404 (NotFoundError) は正常: 重複なし。その他のエラーは再スロー
        const isNotFound = err instanceof Error && err.constructor.name === "NotFoundError"
        if (!isNotFound) throw err
      }
    }

    logger.info(`"${a.title}" を "${a["new-title"]}" に変更中...`)

    const writer = await buildWriter(a)
    const result = await renamePage(writer, {
      project,
      title: a.title,
      newTitle: a["new-title"],
    })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.rename", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を "${a["new-title"]}" に変更しました`)
  },
})
