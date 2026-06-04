/**
 * page/edit/submit.ts — `cos page edit submit <previewId>` コマンド。
 *
 * previewEdit で取得した previewId を確定コミットに変換する。
 * previewId は 5 分で expire するため速やかに実行すること。
 *
 * 認証: PAT 必須（SID・SA では HTTP 403）。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  requirePat,
  requireProject,
} from "@/commands/_shared"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageEditSubmitCommand = defineCommand({
  meta: { name: "submit", description: "previewId を確定コミットに変換する (PAT 必須)" },
  args: {
    project: {
      type: "string" as const,
      alias: "p",
      description: "プロジェクト名",
    },
    profile: {
      type: "string" as const,
      description: "認証プロファイル名",
    },
    json: {
      type: "boolean" as const,
      alias: "J",
      description: "JSON 出力",
      default: false,
    },
    plain: {
      type: "boolean" as const,
      alias: "P",
      description: "プレーンテキスト出力",
      default: false,
    },
    "results-only": {
      type: "boolean" as const,
      description: "--json 時に data のみ返す",
      default: false,
    },
    select: {
      type: "string" as const,
      description: "出力セレクタ",
    },
    "enable-commands": {
      type: "string" as const,
      description: "許可するコマンドリスト",
    },
    "disable-commands": {
      type: "string" as const,
      description: "禁止するコマンドリスト",
    },
    verbose: {
      type: "string" as const,
      alias: "v",
      description: "詳細出力",
    },
    quiet: {
      type: "boolean" as const,
      alias: "q",
      description: "成功時の人間向けメッセージを抑制",
      default: false,
    },
    previewId: {
      type: "positional" as const,
      description: "previewEdit が返した previewId",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { previewId: string }
    checkSandbox("page.edit.submit", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // PAT 必須チェック
    await requirePat(a)

    const client = await buildRestClient(a)
    const response = await client.submitEditV2(project, a.previewId)

    const title = response.page?.title ?? null
    const result = { commitId: response.commitId, title }

    if (a.json) {
      writeJson(result, { command: "page.edit.submit", startTime }, buildJsonOpts(a))
      return
    }

    // プレーンテキスト出力
    const lines = [`commitId: ${result.commitId}`]
    if (title !== null) lines.push(`title:    ${title}`)
    process.stdout.write(`${lines.join("\n")}\n`)
  },
})
