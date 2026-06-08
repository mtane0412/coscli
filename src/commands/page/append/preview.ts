/**
 * page/append/preview.ts — `cos page append preview <title>` コマンド。
 *
 * v2 AI ops API を使ってページ末尾に行を追加する preview を実行し previewId を取得する。
 * 確定は `cos page edit submit <previewId>` で行う。
 *
 * 認証: PAT 必須（SID・SA では HTTP 403）。
 * previewId は 5 分で expire するため、submitEdit を速やかに実行すること。
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
import { buildAppendChanges, buildPreviewResult } from "@/core/edit-v2"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageAppendPreviewCommand = defineCommand({
  meta: {
    name: "preview",
    description: "ページ末尾への行追加を dry-run して previewId を取得する (PAT 必須)",
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
      description: "追加する行テキスト (複数行は \\n で区切る)",
    },
    "from-file": {
      type: "string" as const,
      description: "追加行のファイルパス (- で stdin)",
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
    checkSandbox("page.append.preview", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // PAT 必須チェック（SID・SA は HTTP 403 で弾かれるため事前ガード）
    await requirePat(a)

    const lines = readWriteInput(a, {
      requireContentErrorCode: "CONTENT_REQUIRED",
      requireContentMessage: "追加する行が指定されていません",
      requireContentHint: "--line または --from-file でコンテンツを指定してください",
    })
    runNotationLint(lines, a)

    const client = await buildRestClient(a)
    // pageId を取得して previewEditV2 に渡す
    const page = await client.getPage(project, a.title)
    const translateResult = buildAppendChanges(lines)

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
      writeJson(result, { command: "page.append.preview", startTime }, buildJsonOpts(a))
      return
    }

    // プレーンテキスト出力
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
