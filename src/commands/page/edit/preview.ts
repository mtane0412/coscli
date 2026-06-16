/**
 * page/edit/preview.ts — `cos page edit preview <title>` コマンド。
 *
 * ページ編集 (既存/新規) を dry-run して previewId を取得する。
 * --op で操作種別を切り替える。確定は `cos page edit submit <previewId>` で行う。
 *
 * 認証: PAT 必須（SID・SA では HTTP 403）。
 * previewId は 5 分で expire するため、submitEdit を速やかに実行すること。
 *
 * --op の各値と動作:
 *   ops          : --ops で ops JSON を渡す (既存動作、デフォルト)
 *   append       : 末尾追加 (--text 必須)
 *   prepend      : タイトル直後に挿入 (--text 必須)
 *   insert       : 指定行の後ろに挿入 (--text 必須 + --after / --after-id)
 *   line-replace : 行テキストを置換 (--line-number 必須 + --text 必須)
 *   line-delete  : 行を削除 (--line-number または --range)
 *   new-page     : 新規ページ作成 (--text でページ本文を指定)
 *
 * 後方互換:
 *   --new --body : --op=new-page と同義
 *   --ops        : --op=ops (省略時も含む) と同義
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  exitWithError,
  getRawFlagValue,
  handlePreviewEditV2Error,
  readWriteInput,
  requirePat,
  requireProject,
  runNotationLint,
} from "@/commands/_shared"
import { translateOps } from "@/core/edit-ops"
import {
  buildAppendChanges,
  buildDeleteChanges,
  buildInsertChanges,
  buildNewPageChanges,
  buildPrependChanges,
  buildPreviewResult,
  buildReplaceChanges,
} from "@/core/edit-v2"
import { RangeSpecError, parseLineSpec } from "@/core/range"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** --op に指定できる有効な値 */
const VALID_OPS = [
  "ops",
  "append",
  "prepend",
  "insert",
  "line-replace",
  "line-delete",
  "new-page",
] as const
type OpKind = (typeof VALID_OPS)[number]

/** プレーンテキスト出力のヘルパー */
function outputPlainResult(result: ReturnType<typeof buildPreviewResult>): void {
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
}

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
    op: {
      type: "string" as const,
      description:
        "操作種別 (ops|append|prepend|insert|line-replace|line-delete|new-page)。" +
        "省略時は ops (--ops フラグが必要)。",
    },
    // コンテンツ入力 (append/prepend/insert/new-page/line-replace で使用)
    text: {
      type: "string" as const,
      description:
        "追加・挿入・置換するテキスト (複数行は \\n で区切る)。" +
        "--op=line-replace では置換後テキスト (改行禁止)。",
    },
    "from-file": {
      type: "string" as const,
      description: "追加・挿入テキストのファイルパス (- で stdin)",
    },
    "strict-notation": {
      type: "boolean" as const,
      description: "Cosense 記法の lint を実行する",
      default: false,
    },
    "allow-unsafe-read": {
      type: "boolean" as const,
      description: "--from-file で絶対パスや .. を許可する",
      default: false,
    },
    // 行番号指定 (line-replace/line-delete で使用)
    "line-number": {
      type: "string" as const,
      description: "対象行番号 (1-indexed、タイトル行=1)。--op=line-replace/line-delete で使用",
    },
    range: {
      type: "string" as const,
      description: "削除行範囲 (例: 3:7)。--op=line-delete で使用",
    },
    // 挿入位置 (insert で使用)
    after: {
      type: "string" as const,
      description: "挿入位置の行番号 (1-indexed)。--op=insert で使用",
    },
    "after-id": {
      type: "string" as const,
      description: "挿入先アンカーの lineId。--op=insert で使用",
    },
    // 旧フラグ (後方互換)
    ops: {
      type: "string" as const,
      description: "[後方互換] ops JSON 文字列。--op=ops と同義",
    },
    new: {
      type: "boolean" as const,
      description: "[後方互換] 新規ページ作成モード。--op=new-page と同義",
      default: false,
    },
    body: {
      type: "string" as const,
      description: "[後方互換] --new 時のページ本文。--text と同義",
    },
  },
  async run({ args }) {
    const a = args as unknown as CommonArgs & {
      title: string
      op?: string
      text?: string
      "from-file"?: string
      "strict-notation"?: boolean
      "allow-unsafe-read"?: boolean
      "line-number"?: string
      range?: string
      after?: string
      "after-id"?: string
      // 後方互換
      ops?: string
      new: boolean
      body?: string
    }
    checkSandbox("page.edit.preview", a)
    const project = requireProject(a)
    const startTime = Date.now()

    await requirePat(a)

    // --op バリデーション (指定がある場合のみ)
    if (a.op !== undefined && !(VALID_OPS as readonly string[]).includes(a.op)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--op=${a.op} は無効な値です`,
        `有効な値: ${VALID_OPS.join(", ")}`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    // 後方互換: --new は --op=new-page として処理
    const opKind: OpKind | undefined = a.new ? "new-page" : (a.op as OpKind | undefined)

    const client = await buildRestClient(a)

    // ======= --op=new-page (または --new --body) =======
    if (opKind === "new-page") {
      const bodyText = a.body ?? a.text ?? ""
      const bodyLines = bodyText ? bodyText.split(/\r?\n|\\n/) : []
      const translateResult = buildNewPageChanges(a.title, bodyLines)

      let response: Awaited<ReturnType<typeof client.previewEditV2>>
      try {
        response = await client.previewEditV2(project, { changes: translateResult.changes })
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
        writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
        return
      }
      outputPlainResult(result)
      return
    }

    // ======= --op=append =======
    if (opKind === "append") {
      const lines = readWriteInput(
        {
          ...(a.text !== undefined && { text: a.text }),
          ...(a["from-file"] !== undefined && { "from-file": a["from-file"] }),
          ...(a["allow-unsafe-read"] !== undefined && {
            "allow-unsafe-read": a["allow-unsafe-read"],
          }),
        },
        {
          requireContentErrorCode: "CONTENT_REQUIRED",
          requireContentMessage: "追加するテキストが指定されていません",
          requireContentHint: "--text または --from-file でコンテンツを指定してください",
        },
      )
      if (a["strict-notation"])
        runNotationLint(lines, { "strict-notation": a["strict-notation"] ?? false })

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
        writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
        return
      }
      outputPlainResult(result)
      return
    }

    // ======= --op=prepend =======
    if (opKind === "prepend") {
      const lines = readWriteInput(
        {
          ...(a.text !== undefined && { text: a.text }),
          ...(a["from-file"] !== undefined && { "from-file": a["from-file"] }),
          ...(a["allow-unsafe-read"] !== undefined && {
            "allow-unsafe-read": a["allow-unsafe-read"],
          }),
        },
        {
          requireContentErrorCode: "CONTENT_REQUIRED",
          requireContentMessage: "挿入するテキストが指定されていません",
          requireContentHint: "--text または --from-file でコンテンツを指定してください",
        },
      )
      if (a["strict-notation"])
        runNotationLint(lines, { "strict-notation": a["strict-notation"] ?? false })

      const page = await client.getPage(project, a.title)
      // タイトル直後の行 ID をアンカーとする。タイトル行のみなら "_end"
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
        writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
        return
      }
      outputPlainResult(result)
      return
    }

    // ======= --op=insert =======
    if (opKind === "insert") {
      const lines = readWriteInput(
        {
          ...(a.text !== undefined && { text: a.text }),
          ...(a["from-file"] !== undefined && { "from-file": a["from-file"] }),
          ...(a["allow-unsafe-read"] !== undefined && {
            "allow-unsafe-read": a["allow-unsafe-read"],
          }),
        },
        {
          requireContentErrorCode: "CONTENT_REQUIRED",
          requireContentMessage: "挿入するテキストが指定されていません",
          requireContentHint: "--text または --from-file でコンテンツを指定してください",
        },
      )
      if (a["strict-notation"])
        runNotationLint(lines, { "strict-notation": a["strict-notation"] ?? false })

      const afterId = a["after-id"]
      let afterN: number | undefined

      if (!afterId) {
        if (a.after === undefined) {
          writeErrorJson(
            "VALIDATION_ERROR",
            "--after または --after-id のどちらかを指定してください",
            "--after <n>: 1-indexed の行番号  /  --after-id <lineId>: 行 ID を直接指定",
          )
          exitWithError(5, "VALIDATION_ERROR")
        }
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

      const page = await client.getPage(project, a.title)

      let anchorLineId: string
      if (afterId) {
        anchorLineId = afterId
      } else {
        if ((afterN as number) > page.lines.length) {
          writeErrorJson(
            "VALIDATION_ERROR",
            `--after の値が範囲外です: ${afterN} (ページの行数: ${page.lines.length})`,
          )
          exitWithError(5, "VALIDATION_ERROR")
        }
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
        writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
        return
      }
      outputPlainResult(result)
      return
    }

    // ======= --op=line-replace =======
    if (opKind === "line-replace") {
      // --line-number 必須
      if (!a["line-number"]) {
        writeErrorJson(
          "VALIDATION_ERROR",
          "--line-number が指定されていません",
          "--line-number <n> で対象行番号 (1-indexed) を指定してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }

      let lineN: number
      try {
        const spec = parseLineSpec({ line: a["line-number"] })
        lineN = spec.start
      } catch (err) {
        if (err instanceof RangeSpecError) {
          writeErrorJson("VALIDATION_ERROR", err.message)
          exitWithError(5, "VALIDATION_ERROR")
        }
        throw err
      }

      // --text 必須 (置換後テキスト)
      const text = a.text ?? ""
      if (!text) {
        writeErrorJson(
          "CONTENT_REQUIRED",
          "置換後のテキストが指定されていません",
          "--text で置換内容を指定してください",
        )
        exitWithError(5, "CONTENT_REQUIRED")
      }

      const page = await client.getPage(project, a.title)
      const targetLine = page.lines[lineN - 1]
      if (!targetLine) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--line-number の値が範囲外です: ${lineN} (ページの行数: ${page.lines.length})`,
        )
        exitWithError(5, "VALIDATION_ERROR")
      }

      let translateResult: ReturnType<typeof buildReplaceChanges>
      try {
        translateResult = buildReplaceChanges(targetLine.id, text)
      } catch (err) {
        writeErrorJson(
          "INVALID_OPS",
          err instanceof Error ? err.message : String(err),
          "改行を含む置換には --op=ops を使用してください",
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
        writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
        return
      }
      outputPlainResult(result)
      return
    }

    // ======= --op=line-delete =======
    if (opKind === "line-delete") {
      // --line-number または --range が必要
      if (!a["line-number"] && !a.range) {
        writeErrorJson(
          "VALIDATION_ERROR",
          "--line-number または --range のどちらかを指定してください",
          "--line-number <n>: 単一行  /  --range a:b: 行範囲",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }

      let start: number
      let end: number
      try {
        const spec = parseLineSpec({
          ...(a["line-number"] !== undefined && { line: a["line-number"] }),
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

      // タイトル行 (1行目) の削除を禁止する
      if (start === 1) {
        writeErrorJson(
          "TITLE_LINE_PROTECTED",
          "タイトル行 (1行目) は削除できません",
          "ページを削除する場合は `cos page delete` を使用してください",
        )
        exitWithError(5, "TITLE_LINE_PROTECTED")
      }

      const page = await client.getPage(project, a.title)
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
        writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
        return
      }
      outputPlainResult(result)
      return
    }

    // ======= --op=ops または op 未指定 (既存の --ops 動作) =======
    const opsRaw = a.ops
    if (!opsRaw) {
      writeErrorJson(
        "OPS_REQUIRED",
        "ops が指定されていません",
        "--ops フラグで ops JSON を指定するか、--op=append/prepend/... で操作種別を指定してください",
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

    if (!parsedInput || typeof parsedInput !== "object" || Array.isArray(parsedInput)) {
      writeErrorJson(
        "INVALID_OPS_JSON",
        'ops JSON は {"ops": [...]} 形式のオブジェクトである必要があります',
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

    const page = await client.getPage(project, a.title)
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
      writeJson(result, { command: "page.edit.preview", startTime }, buildJsonOpts(a))
      return
    }
    outputPlainResult(result)
  },
})
