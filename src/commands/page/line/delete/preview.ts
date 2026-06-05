/**
 * page/line/delete/preview.ts — `cos page line delete preview <title>` コマンド。
 *
 * v2 AI ops API を使って指定行 (--line n) または行範囲 (--range a:b) を削除する
 * preview を実行し previewId を取得する。
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
import { buildDeleteChanges, buildPreviewResult } from "@/core/edit-v2"
import { RangeSpecError, parseLineSpec } from "@/core/range"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageLineDeletePreviewCommand = defineCommand({
  meta: {
    name: "preview",
    description: "指定行または行範囲の削除を dry-run して previewId を取得する (PAT 必須)",
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
      description: "削除する行番号 (1-indexed、タイトル行=1)",
    },
    range: {
      type: "string" as const,
      description: "削除する行範囲 (例: 3:7)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title: string
      line?: string
      range?: string
    }
    checkSandbox("page.line.delete.preview", a)
    const project = requireProject(a)
    const startTime = Date.now()

    await requirePat(a)

    // --line / --range パース
    let start: number
    let end: number
    try {
      const spec = parseLineSpec({
        ...(a.line !== undefined && { line: a.line }),
        ...(a.range !== undefined && { range: a.range }),
      })
      start = spec.start
      end = spec.end
    } catch (err) {
      if (err instanceof RangeSpecError) {
        writeErrorJson("VALIDATION_ERROR", err.message)
        exitWithError(5, "VALIDATION_ERROR")
      }
      throw err
    }

    // タイトル行 (1行目) の削除を禁止する: 削除するとページが意図せずリネームされるため
    if (start === 1) {
      writeErrorJson(
        "TITLE_LINE_PROTECTED",
        "タイトル行 (1行目) は削除できません",
        "ページを削除する場合は `cos page delete` を使用してください",
      )
      exitWithError(5, "TITLE_LINE_PROTECTED")
    }

    const client = await buildRestClient(a)
    const page = await client.getPage(project, a.title)

    // 行番号 (1-indexed) から lineId 配列を解決する
    const lineIds: string[] = []
    for (let i = start; i <= end; i++) {
      const line = page.lines[i - 1]
      if (!line) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `行番号 ${i} が範囲外です (ページの行数: ${page.lines.length})`,
        )
        exitWithError(5, "VALIDATION_ERROR")
      }
      lineIds.push(line.id)
    }

    const translateResult = buildDeleteChanges(lineIds)

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
      writeJson(result, { command: "page.line.delete.preview", startTime }, buildJsonOpts(a))
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
