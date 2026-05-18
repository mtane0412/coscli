/**
 * page/rename.ts — `cos page rename <title> <new-title>` コマンド。
 *
 * ページタイトルを変更する。WebSocket commit で lines[0] を書き換えることで
 * @cosense/std が TitleChange を自動 emit する。
 *
 * --dry-run 以外時は変更前に以下のチェックを行う:
 * 1. リネーム元が persistent:false (プレースホルダー) または存在しない場合は
 *    NOT_FOUND エラー (exit 4) で終了する。(issue #112)
 * 2. --force-fallback なし時、リネーム先に実体ページが存在する場合は
 *    DUPLICATE_TITLE エラー (exit 5) で終了する。(issue #57)
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
import { EXIT_NOT_FOUND } from "@/core/exit-codes"
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

    if (!a["dry-run"]) {
      const client = await buildRestClient(a)

      // リネーム元の存在 + persistent チェック (issue #112)
      // persistent:true 以外 (false / undefined) のページは実体がなく rename すると空ページが新規作成される。
      // persistent が undefined のケースも安全側に倒して NOT_FOUND (exit 4) で終了する。
      // 404 (NotFoundError) も同様にリネーム不可として NOT_FOUND (exit 4) で終了する。
      try {
        const srcPage = await client.getPage(project, a.title)
        if (srcPage.persistent !== true) {
          writeErrorJson(
            "NOT_FOUND",
            `"${a.title}" は実体のないページのため rename できません`,
            "cos page get で persistent の値を確認してください",
          )
          process.exit(EXIT_NOT_FOUND)
          return
        }
      } catch (err) {
        const isNotFound = err instanceof Error && err.name === "NotFoundError"
        if (isNotFound) {
          writeErrorJson(
            "NOT_FOUND",
            `ページ "${a.title}" が見つかりません`,
            "ページタイトルを確認してください",
          )
          process.exit(EXIT_NOT_FOUND)
          return
        }
        throw err
      }

      // リネーム先の重複チェック (--force-fallback なし時、同名は no-op なのでスキップ)
      // Cosense REST API は存在しないページに persistent:false のスタブとして 200 を返すため、
      // getPage の成功だけでは重複の証明にならない。persistent !== false の場合のみ実体ページ扱い。(issue #57)
      if (!a["force-fallback"] && a["new-title"] !== a.title) {
        try {
          const page = await client.getPage(project, a["new-title"])
          if (page.persistent !== false) {
            writeErrorJson(
              "DUPLICATE_TITLE",
              `"${a["new-title"]}" は既に存在します`,
              "別のタイトルを指定するか、--force-fallback を使用してください",
            )
            process.exit(5)
            return
          }
        } catch (err) {
          // 404 (NotFoundError) は正常: 重複なし。その他のエラーは再スロー
          const isNotFound = err instanceof Error && err.name === "NotFoundError"
          if (!isNotFound) throw err
        }
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
