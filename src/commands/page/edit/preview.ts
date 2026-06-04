/**
 * page/edit/preview.ts — `cos page edit preview <title>` コマンド。
 *
 * 既存ページへの ops ベース編集を dry-run して previewId を取得する。
 * --new フラグ指定時は新規ページ作成の preview を実行する。
 *
 * 認証: PAT 必須（SID・SA では HTTP 403）。
 * previewId は 5 分で expire するため、submitEdit を速やかに実行すること。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  exitWithError,
  requirePat,
  requireProject,
} from "@/commands/_shared"
import { translateOps } from "@/core/edit-ops"
import { writeErrorJson, writeJson } from "@/presenter/json"
import type { PagePreview } from "@/schemas/edit-v2"
import { defineCommand } from "citty"

export const pageEditPreviewCommand = defineCommand({
  meta: { name: "preview", description: "ops をドライランして previewId を取得する (PAT 必須)" },
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
    title: {
      type: "positional" as const,
      description: "ページタイトル",
      required: true,
    },
    ops: {
      type: "string" as const,
      description: "ops JSON 文字列（stdin の代わりにインラインで渡す場合）",
    },
    new: {
      type: "boolean" as const,
      description: "新規ページ作成モード（--body でページ本文を指定する）",
      default: false,
    },
    body: {
      type: "string" as const,
      description: "--new 時のページ本文（改行区切り）",
    },
  },
  async run({ args }) {
    const a = args as unknown as CommonArgs & {
      title: string
      ops?: string
      new: boolean
      body?: string
    }
    checkSandbox("page.edit.preview", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // PAT 必須チェック（SID・SA は 403 で弾かれるため事前ガード）
    await requirePat(a)

    const client = await buildRestClient(a)

    if (a.new) {
      // 新規ページ作成モード
      const bodyText = a.body ?? ""
      const fullText = `${a.title}${bodyText ? `\n${bodyText}` : ""}`
      let changes: ReturnType<typeof translateOps>["changes"]
      try {
        ;({ changes } = translateOps([{ insertBefore: "_end", text: fullText }]))
      } catch (err) {
        writeErrorJson(
          "INVALID_OPS",
          `ops 変換エラー: ${err instanceof Error ? err.message : String(err)}`,
        )
        exitWithError(5, "INVALID_OPS")
      }

      const response = await client.previewEditV2(project, { changes })
      const status = response.pagePreview?.persistent === false ? "create" : "update"
      const result = buildPreviewResult(
        response.previewId,
        response.expireAt,
        status,
        a.title,
        response.pagePreview,
        [],
      )

      writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
      return
    }

    // 既存ページ編集モード
    // ops JSON をパースする
    const opsRaw = a.ops
    if (!opsRaw) {
      writeErrorJson(
        "OPS_REQUIRED",
        "ops が指定されていません",
        "--ops フラグで ops JSON を指定してください",
      )
      exitWithError(5, "OPS_REQUIRED")
    }

    let parsedInput: unknown
    try {
      parsedInput = JSON.parse(opsRaw)
    } catch (err) {
      writeErrorJson(
        "INVALID_OPS_JSON",
        `ops JSON のパースに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
        "--ops に正しい JSON を指定してください",
      )
      exitWithError(5, "INVALID_OPS_JSON")
    }

    const opsArray = (parsedInput as Record<string, unknown>)["ops"]
    let translateResult: ReturnType<typeof translateOps>
    try {
      translateResult = translateOps(opsArray)
    } catch (err) {
      writeErrorJson(
        "INVALID_OPS",
        `ops の変換に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
      exitWithError(5, "INVALID_OPS")
    }

    // ページの pageId を取得する
    const page = await client.getPage(project, a.title)
    const response = await client.previewEditV2(project, {
      pageId: page.id,
      changes: translateResult.changes,
    })

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
      writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
      return
    }

    // プレーンテキスト出力
    const lines: string[] = [
      `previewId: ${result.previewId}`,
      `expireAt:  ${result.expireAt}`,
      `status:    ${result.status}`,
      `title:     ${result.title}`,
    ]
    if (result.lines.length > 0) {
      lines.push("")
      lines.push("page (after apply):")
      for (const line of result.lines) {
        const marker = line.marker === "new" ? "> " : line.marker === "updated" ? "* " : "  "
        lines.push(`${marker}${line.text}`)
      }
    }
    process.stdout.write(`${lines.join("\n")}\n`)
  },
})

/** buildPreviewResult はレスポンスから出力用のデータ構造を組み立てる。 */
function buildPreviewResult(
  previewId: string,
  expireAt: string,
  status: "create" | "update",
  title: string,
  pagePreview: PagePreview,
  idSets: [Set<string>, Set<string>] | [],
) {
  const [newLineIds, updatedLineIds] =
    idSets.length === 2 ? idSets : [new Set<string>(), new Set<string>()]

  const lines = (pagePreview?.lines ?? []).map((line) => ({
    id: line.id,
    text: line.text,
    marker: newLineIds.has(line.id)
      ? ("new" as const)
      : updatedLineIds.has(line.id)
        ? ("updated" as const)
        : null,
  }))

  return { previewId, expireAt, status, title, lines }
}
