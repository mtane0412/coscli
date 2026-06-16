/**
 * page/get.ts — `cos page get <title>` コマンド。
 *
 * ページ詳細の取得および各種フォーマット変換を一本化した読み取り統合エントリ。
 *
 * --format の各値と動作:
 *   (指定なし) : ページ詳細 JSON / プレーンテキスト (タイトル + 本文行)
 *   ai         : エージェント向け Markdown (メタ + 本文 + 1-hop リンク先)
 *   text / txt : ページ本文テキスト (Scrapbox 記法そのまま)
 *   md         : ページ本文を Markdown に変換
 *   scrapbox   : text の alias
 *   context    : Smart Context (1hop/2hop リンク先本文)
 *   code       : コードブロック (--filename 必須)
 *   table      : テーブル CSV (--filename 必須)
 *   url        : ページ URL (API 呼び出しなし)
 *   icon       : ページアイコン URL (API 呼び出しなし)
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  requireProject,
} from "@/commands/_shared"
import { buildIconUrl, buildPageUrl } from "@/core/api/encoder"
import { formatAiPage } from "@/core/format/ai-page"
import { type BoldStyle, convert } from "@/core/format/index"
import { filterSmartContextByQuery } from "@/core/format/page-format"
import { getCodeBlock, getPage, getPageText, getSmartContext, getTable } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** text 系フォーマット (本文テキスト取得を行うもの) */
const TEXT_FORMATS = ["text", "txt", "md", "scrapbox"] as const
type TextFormat = (typeof TEXT_FORMATS)[number]

/** filename が必須のフォーマット */
const FILENAME_REQUIRED_FORMATS = ["code", "table"] as const

/** --format に指定できる有効な値 */
const VALID_FORMATS = [
  "ai",
  "text",
  "txt",
  "md",
  "scrapbox",
  "context",
  "code",
  "table",
  "url",
  "icon",
] as const
type Format = (typeof VALID_FORMATS)[number]

const VALID_HOPS = [1, 2] as const

export const pageGetCommand = defineCommand({
  meta: {
    name: "get",
    description: "ページ詳細を取得する (--format で出力形式を切り替え)",
  },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    format: {
      type: "string",
      description:
        "出力フォーマット (ai|text|md|scrapbox|context|code|table|url|icon)。" +
        "ai はエージェント向け Markdown。code/table は --filename 必須",
    },
    filename: {
      type: "string",
      description: "--format=code または --format=table のとき必須。ブロック/テーブルのファイル名",
    },
    hops: {
      type: "string",
      description: "--format=context のとき有効。取得するリンクの深さ (1 | 2)。デフォルト: 1",
      default: "1",
    },
    query: {
      type: "string",
      description: "--format=context のとき有効。hop 近傍ページを本文キーワードで絞り込む",
      default: "",
    },
    "bold-style": {
      type: "string",
      description:
        "--format=md のとき有効。太字記法解釈 (auto | heading | emphasis)。デフォルト: auto",
      default: "auto",
    },
    "body-only": {
      type: "boolean",
      description: "--format=text|md のとき有効。タイトル行を除いた本文のみを出力する",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title: string
      format?: string
      filename?: string
      hops: string
      query: string
      "bold-style": string
      "body-only": boolean
    }
    checkSandbox("page.get", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --format バリデーション
    if (a.format !== undefined && !(VALID_FORMATS as readonly string[]).includes(a.format)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--format=${a.format} は無効な値です`,
        `有効な値: ${VALID_FORMATS.join(", ")}`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    const format = a.format as Format | undefined

    // --format code / table は --filename 必須
    if (
      format !== undefined &&
      (FILENAME_REQUIRED_FORMATS as readonly string[]).includes(format) &&
      !a.filename
    ) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--format=${format} は --filename が必須です`,
        '例: cos page get "タイトル" --format=code --filename=src.ts',
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    // --format ai と --json の排他制御
    if (format === "ai" && a.json) {
      writeErrorJson(
        "VALIDATION_ERROR",
        "--format=ai と --json は同時に指定できません",
        "--format=ai は Markdown 形式で出力するため JSON envelope は不要です",
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    // --- url / icon: API 呼び出しなし ---
    if (format === "url") {
      const logger = buildLogger(a)
      logger.verbose(`URL を生成: ${a.title}`)
      const url = buildPageUrl(project, a.title)
      if (a.json) {
        writeJson({ url }, { command: "page.get", startTime }, buildJsonOpts(a))
        return
      }
      process.stdout.write(`${url}\n`)
      return
    }

    if (format === "icon") {
      const logger = buildLogger(a)
      logger.verbose(`アイコン URL を生成: ${a.title}`)
      const url = buildIconUrl(project, a.title)
      if (a.json) {
        writeJson({ icon: url }, { command: "page.get", startTime }, buildJsonOpts(a))
        return
      }
      process.stdout.write(`${url}\n`)
      return
    }

    // --- REST API が必要なフォーマット ---
    const client = await buildRestClient(a)

    // --format ai
    if (format === "ai") {
      const [page, members] = await Promise.all([
        getPage(client, { project, title: a.title }),
        client.getProjectMembers(project).catch(() => null),
      ])
      const markdown = formatAiPage(page, members)
      process.stdout.write(markdown)
      return
    }

    // --format text / txt / md / scrapbox
    if (format !== undefined && (TEXT_FORMATS as readonly string[]).includes(format)) {
      const resolvedFormat: TextFormat =
        format === "scrapbox" || format === "txt" ? "text" : (format as TextFormat)
      const rawText = await getPageText(client, { project, title: a.title })

      let outputText: string
      if (resolvedFormat === "md") {
        const converted = convert(rawText, "scrapbox", "md", {
          boldStyle: a["bold-style"] as BoldStyle,
        })
        // --body-only 指定時は MD 変換後に先頭の # タイトル行と直後の空行を除く
        outputText = a["body-only"]
          ? converted.split("\n").slice(1).join("\n").replace(/^\n+/, "")
          : converted
      } else {
        outputText = a["body-only"] ? rawText.split("\n").slice(1).join("\n") : rawText
      }

      if (a.json) {
        writeJson({ text: outputText }, { command: "page.get", startTime }, buildJsonOpts(a))
        return
      }
      process.stdout.write(`${outputText}\n`)
      return
    }

    // --format context
    if (format === "context") {
      const hopsNum = Number(a.hops)
      if (!(VALID_HOPS as readonly number[]).includes(hopsNum)) {
        writeErrorJson(
          "VALIDATION_ERROR",
          `--hops=${a.hops} は無効な値です`,
          `有効な値: ${VALID_HOPS.join(", ")}`,
        )
        exitWithError(5, "VALIDATION_ERROR")
      }
      const hops = hopsNum as 1 | 2
      const rawText = await getSmartContext(client, { project, title: a.title, hops })
      const text = filterSmartContextByQuery(rawText, a.query)
      if (a.json) {
        writeJson({ text }, { command: "page.get", startTime }, buildJsonOpts(a))
        return
      }
      if (text) {
        process.stdout.write(`${text}\n`)
      }
      return
    }

    // --format code
    if (format === "code") {
      const code = await getCodeBlock(client, {
        project,
        title: a.title,
        // filename は上のバリデーションで存在が保証されている
        // biome-ignore lint/style/noNonNullAssertion: conditionalArgs で保証
        filename: a.filename!,
      })
      if (a.json) {
        writeJson({ code }, { command: "page.get", startTime }, buildJsonOpts(a))
        return
      }
      process.stdout.write(`${code}\n`)
      return
    }

    // --format table
    if (format === "table") {
      const csv = await getTable(client, {
        project,
        title: a.title,
        // biome-ignore lint/style/noNonNullAssertion: conditionalArgs で保証
        filename: a.filename!,
      })
      if (a.json) {
        writeJson({ csv }, { command: "page.get", startTime }, buildJsonOpts(a))
        return
      }
      process.stdout.write(`${csv}\n`)
      return
    }

    // --- デフォルト: ページ詳細 JSON / プレーンテキスト ---
    const page = await getPage(client, { project, title: a.title })

    if (a.json || !a.plain) {
      writeJson(page, { command: "page.get", startTime }, buildJsonOpts(a))
      return
    }

    process.stdout.write(`${page.title}\n`)
    for (const line of page.lines) {
      process.stdout.write(`${line.text}\n`)
    }
  },
})
