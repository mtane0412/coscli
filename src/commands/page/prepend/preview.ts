/**
 * page/prepend/preview.ts — `cos page prepend preview <title>` コマンド。
 *
 * v2 AI ops API を使ってページのタイトル直後に行を挿入する preview を実行し previewId を取得する。
 * タイトル行のみのページでは "_end" をアンカーとして使う。
 * 確定は `cos page edit submit <previewId>` で行う。
 *
 * 認証: PAT 必須（SID・SA では HTTP 403）。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  handlePreviewEditV2Error,
  readWriteInput,
  requirePat,
  requireProject,
  runNotationLint,
  strictNotationArg,
  unsafeReadArg,
} from "@/commands/_shared"
import { buildPrependChanges, buildPreviewResult } from "@/core/edit-v2"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pagePrependPreviewCommand = defineCommand({
  meta: {
    name: "preview",
    description:
      "ページ先頭（タイトル直後）への行挿入を dry-run して previewId を取得する (PAT 必須)",
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
      description: "挿入する行テキスト (複数行は \\n で区切る)",
    },
    "from-file": {
      type: "string" as const,
      description: "挿入行のファイルパス (- で stdin)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title: string
      line?: string
      "from-file"?: string
      "allow-unsafe-read": boolean
      "strict-notation": boolean
    }
    checkSandbox("page.prepend.preview", a)
    const project = requireProject(a)
    const startTime = Date.now()

    await requirePat(a)

    const lines = readWriteInput(a, {
      requireContentErrorCode: "CONTENT_REQUIRED",
      requireContentMessage: "挿入する行が指定されていません",
      requireContentHint: "--line または --from-file でコンテンツを指定してください",
    })
    runNotationLint(lines, a)

    const client = await buildRestClient(a)
    const page = await client.getPage(project, a.title)

    // タイトル直後の行 ID をアンカーとする。タイトル行のみの場合は "_end" にフォールバック
    const anchorLineId = page.lines[1]?.id ?? "_end"
    const translateResult = buildPrependChanges(anchorLineId, lines)

    let response: Awaited<ReturnType<typeof client.previewEditV2>>
    try {
      response = await client.previewEditV2(project, {
        pageId: page.id,
        changes: translateResult.changes,
      })
    } catch (err) {
      handlePreviewEditV2Error(err, a.title)
      throw err
    }

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
      writeJson(result, { command: "page.prepend.preview", startTime }, buildJsonOpts(a))
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
