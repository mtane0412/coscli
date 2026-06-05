/**
 * page/insert/preview.ts — `cos page insert preview <title>` コマンド。
 *
 * v2 AI ops API を使って指定行の後ろに行を挿入する preview を実行し previewId を取得する。
 * --after <n> (1-indexed) でページの行番号を指定するか、--after-id <lineId> で直接 lineId を指定する。
 * 最終行の後ろへの挿入は "_end" アンカーを使う。
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
  exitWithError,
  getRawFlagValue,
  handlePreviewEditV2Error,
  readWriteInput,
  requirePat,
  requireProject,
  strictNotationArg,
  unsafeReadArg,
} from "@/commands/_shared"
import { buildInsertChanges, buildPreviewResult } from "@/core/edit-v2"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageInsertPreviewCommand = defineCommand({
  meta: {
    name: "preview",
    description: "指定行の後ろへの行挿入を dry-run して previewId を取得する (PAT 必須)",
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
    after: {
      type: "string" as const,
      description: "挿入位置 (1-indexed の行番号、タイトル行=1)",
    },
    "after-id": {
      type: "string" as const,
      description: "挿入先アンカーの lineId (この行の直前に挿入される)",
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
      after?: string
      "after-id"?: string
      line?: string
      "from-file"?: string
      "allow-unsafe-read": boolean
      "strict-notation": boolean
    }
    checkSandbox("page.insert.preview", a)
    const project = requireProject(a)
    const startTime = Date.now()

    await requirePat(a)

    // --after と --after-id のどちらかが必要
    const afterId = a["after-id"]
    let afterN: number | undefined

    if (!afterId) {
      // --after も --after-id も指定されていない場合
      if (a.after === undefined) {
        writeErrorJson(
          "VALIDATION_ERROR",
          "--after または --after-id のどちらかを指定してください",
          "--after <n>: 1-indexed の行番号  /  --after-id <lineId>: 行 ID を直接指定",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }
      // --after バリデーション (1-indexed、正の整数のみ許可)
      const rawAfter = a.after !== "" ? a.after : (getRawFlagValue(process.argv, "after") ?? "")
      if (!/^[1-9]\d*$/.test(rawAfter)) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--after の値が無効です: "${rawAfter}"`,
          "1 以上の整数を指定してください (タイトル行=1)",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }
      afterN = Number.parseInt(rawAfter, 10)
    }

    const lines = readWriteInput(a, {
      requireContentErrorCode: "CONTENT_REQUIRED",
      requireContentMessage: "挿入する行が指定されていません",
      requireContentHint: "--line または --from-file でコンテンツを指定してください",
    })

    const client = await buildRestClient(a)
    const page = await client.getPage(project, a.title)

    // アンカー lineId を解決する
    let anchorLineId: string
    if (afterId) {
      // --after-id で直接指定
      anchorLineId = afterId
    } else {
      // --after で行番号指定: 次行 (after番目+1) の lineId を取得する
      // lines は 0-indexed なので lines[afterN] が次行 (最終行指定時は undefined → "_end")
      anchorLineId = page.lines[afterN as number]?.id ?? "_end"
    }

    const translateResult = buildInsertChanges(anchorLineId, lines)

    let response: Awaited<ReturnType<typeof client.previewEditV2>>
    try {
      response = await client.previewEditV2(project, {
        pageId: page.id,
        changes: translateResult.changes,
      })
    } catch (err) {
      handlePreviewEditV2Error(err, a.title)
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
      writeJson(result, { command: "page.insert.preview", startTime }, buildJsonOpts(a))
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
