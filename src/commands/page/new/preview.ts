/**
 * page/new/preview.ts — `cos page new preview <title>` コマンド。
 *
 * @deprecated `cos page edit preview --op=new-page` を使用してください。
 *
 * v2 AI ops API を使って新しいページを作成する preview を実行し previewId を取得する。
 * タイトルと本文を `insertBefore: "_end"` ops に変換して pageId なしで送信する。
 * 確定は `cos page edit submit <previewId>` で行う。
 *
 * 認証: PAT 必須（SID・SA では HTTP 403）。
 */

import { DEPRECATION_SINCE, warnDeprecated } from "@/commands/_deprecation"
import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  readWriteInput,
  requirePat,
  requireProject,
  runNotationLint,
  strictNotationArg,
  unsafeReadArg,
} from "@/commands/_shared"
import { buildNewPageChanges, buildPreviewResult } from "@/core/edit-v2"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageNewPreviewCommand = defineCommand({
  meta: {
    name: "preview",
    description: "新規ページ作成を dry-run して previewId を取得する (PAT 必須)",
  },
  args: {
    ...commonArgs,
    ...strictNotationArg,
    ...unsafeReadArg,
    title: {
      type: "positional" as const,
      description: "ページタイトル",
      required: true,
    },
    line: {
      type: "string" as const,
      description: "本文行テキスト。複数行は \\n で区切るか、--line を複数回指定する",
    },
    "from-file": {
      type: "string" as const,
      description: "本文ファイルパス (- で stdin)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title: string
      /** citty が --line を複数回受け取ると string[] になる */
      line?: string | string[]
      "from-file"?: string
      "allow-unsafe-read": boolean
      "strict-notation": boolean
    }
    checkSandbox("page.new.preview", a)
    const project = requireProject(a)
    const startTime = Date.now()

    const warnings: string[] = []
    warnDeprecated("page new preview", "page edit preview --op=new-page", warnings)

    await requirePat(a)

    const bodyLines = readWriteInput(a, {
      requireContentErrorCode: "CONTENT_REQUIRED",
      requireContentMessage: "ページ本文が指定されていません",
      requireContentHint: "--line または --from-file でコンテンツを指定してください",
    })
    runNotationLint(bodyLines, a)

    const client = await buildRestClient(a)
    // 新規ページ: pageId なしで previewEditV2 を呼ぶ
    const translateResult = buildNewPageChanges(a.title, bodyLines)

    const response = await client.previewEditV2(project, { changes: translateResult.changes })

    const status = response.pagePreview?.persistent === false ? "create" : "update"
    const result = buildPreviewResult(
      response.previewId,
      response.expireAt,
      status,
      a.title,
      response.pagePreview,
      [translateResult.newLineIds, translateResult.updatedLineIds],
    )

    if (a.json) {
      writeJson(
        result,
        {
          command: "page.new.preview",
          startTime,
          warnings,
          canonicalCommand: "page.edit.preview",
          deprecated: { since: DEPRECATION_SINCE, replacement: "page edit preview --op=new-page" },
        },
        buildJsonOpts(a),
      )
      return
    }

    const outputLines: string[] = [
      `previewId: ${result.previewId}`,
      `expireAt:  ${result.expireAt}`,
      `status:    ${result.status}`,
      `title:     ${result.title}`,
    ]
    if (result.lines.length > 0) {
      outputLines.push("")
      outputLines.push("page (after apply):")
      for (const line of result.lines) {
        const marker = line.marker === "new" ? "> " : line.marker === "updated" ? "* " : "  "
        outputLines.push(`${marker}${line.text}`)
      }
    }
    process.stdout.write(`${outputLines.join("\n")}\n`)
  },
})
