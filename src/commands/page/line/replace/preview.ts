/**
 * page/line/replace/preview.ts — `cos page line replace preview <title>` コマンド。
 *
 * v2 AI ops API を使って指定行 (--line n) のテキストを置換する preview を実行し previewId を取得する。
 * --text に改行が含まれる場合は INVALID_OPS (exit 5) で終了する（API 制約）。
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
  handlePreviewEditV2Error,
  requirePat,
  requireProject,
} from "@/commands/_shared"
import { buildPreviewResult, buildReplaceChanges } from "@/core/edit-v2"
import { RangeSpecError, parseLineSpec } from "@/core/range"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageLineReplacePreviewCommand = defineCommand({
  meta: {
    name: "preview",
    description: "指定行の置換を dry-run して previewId を取得する (PAT 必須、単一行のみ)",
  },
  args: {
    ...commonArgs,
    title: {
      type: "positional" as const,
      description: "ページタイトル",
      required: true,
    },
    line: {
      type: "string" as const,
      description: "置換する行番号 (1-indexed、タイトル行=1)",
    },
    text: {
      type: "string" as const,
      description: "置換後のテキスト (改行禁止)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title: string
      line?: string
      text?: string
    }
    checkSandbox("page.line.replace.preview", a)
    const project = requireProject(a)
    const startTime = Date.now()

    await requirePat(a)

    // --line / テキストのバリデーション
    let lineN: number
    try {
      const spec = parseLineSpec({
        ...(a.line !== undefined && { line: a.line }),
      })
      lineN = spec.start
    } catch (err) {
      if (err instanceof RangeSpecError) {
        writeErrorJson("VALIDATION_ERROR", err.message)
        exitWithError(5, "VALIDATION_ERROR")
      }
      throw err
    }

    const text = a.text ?? ""
    if (!text) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "置換後のテキストが指定されていません",
        "--text で置換内容を指定してください",
      )
      exitWithError(5, "CONTENT_REQUIRED")
    }

    const client = await buildRestClient(a)
    const page = await client.getPage(project, a.title)

    // 行番号 (1-indexed) から lineId を解決する
    const targetLine = page.lines[lineN - 1]
    if (!targetLine) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--line の値が範囲外です: ${lineN} (ページの行数: ${page.lines.length})`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    // buildReplaceChanges は改行入りテキストで throws する (INVALID_OPS として捕捉)
    let translateResult: ReturnType<typeof buildReplaceChanges>
    try {
      translateResult = buildReplaceChanges(targetLine.id, text)
    } catch (err) {
      writeErrorJson(
        "INVALID_OPS",
        err instanceof Error ? err.message : String(err),
        "改行を含む置換には `cos page edit preview --ops` を使用してください",
      )
      exitWithError(5, "INVALID_OPS")
    }

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
      writeJson(result, { command: "page.line.replace.preview", startTime }, buildJsonOpts(a))
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
