/**
 * page/context.ts — `cos page context <title>` コマンド。
 *
 * 指定ページを起点に Smart Context API を叩き、
 * 1hop または 2hop 先までのリンク先ページ本文をテキストで取得して stdout に出力する。
 * LLM への文脈投入やエージェントによるページ関連情報収集に使う。
 * --query を指定すると、ページセクション単位でキーワードフィルタを行う。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  requireProject,
} from "@/commands/_shared"
import { getSmartContext } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** 有効な hops 値 */
const VALID_HOPS = [1, 2] as const
type Hops = (typeof VALID_HOPS)[number]

/** Smart Context XML 形式のページブロック抽出パターン。<Page ...>...</Page> 単位でマッチ。 */
const XML_PAGE_BLOCK_PATTERN = /<Page\s[^>]*>[\s\S]*?<\/Page>/g

/** Smart Context テキストのページセクション区切り行 (==[ページタイトル]== 形式)。m フラグで行単位にマッチ。 */
const SECTION_MARKER_PATTERN = /^==[^=\n]+==$/m

/**
 * filterSmartContextByQuery は Smart Context テキストをクエリキーワードでフィルタする。
 *
 * フォーマット検出の優先順位:
 *   1. `<Page title="...">...</Page>` XML 形式 (実際の Smart Context API が返す形式)
 *   2. `==[title]==` マーカー行形式 (旧形式フォールバック)
 *   3. 空行区切り形式 (その他フォールバック)
 *
 * XML 形式の場合は `<Page>...</Page>` ブロック単位でフィルタする。
 * クエリは大文字・小文字を区別しない。query が空文字のときはフィルタせず全文を返す。
 */
export function filterSmartContextByQuery(text: string, query: string): string {
  if (!query) return text
  const lowerQuery = query.toLowerCase()

  // <Page title="..."> ... </Page> XML 形式
  if (/<Page\s+title=/.test(text)) {
    const allBlocks: string[] = []
    const regex = new RegExp(XML_PAGE_BLOCK_PATTERN.source, "g")
    let match = regex.exec(text)
    while (match !== null) {
      allBlocks.push(match[0])
      match = regex.exec(text)
    }
    const filtered = allBlocks.filter((block) => block.toLowerCase().includes(lowerQuery))
    return filtered.join("\n\n\n")
  }

  // ==[title]== マーカー行形式
  if (SECTION_MARKER_PATTERN.test(text)) {
    const lines = text.split("\n")
    const sections: string[] = []
    let currentLines: string[] = []

    for (const line of lines) {
      if (SECTION_MARKER_PATTERN.test(line) && currentLines.length > 0) {
        sections.push(currentLines.join("\n"))
        currentLines = [line]
      } else {
        currentLines.push(line)
      }
    }
    if (currentLines.length > 0) {
      sections.push(currentLines.join("\n"))
    }

    const filtered = sections.filter((s) => s.toLowerCase().includes(lowerQuery))
    return filtered.join("\n")
  }

  // フォールバック: 1 行以上の空行でページセクションを分割する
  const sections = text.split(/\n{2,}/)
  const filtered = sections.filter((section) => section.toLowerCase().includes(lowerQuery))
  return filtered.join("\n\n")
}

export const pageContextCommand = defineCommand({
  meta: { name: "context", description: "ページ起点の Smart Context (リンク先本文) を取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "起点となるページタイトル",
      required: true,
    },
    hops: {
      type: "string",
      description: "取得するリンクの深さ (1 | 2)。デフォルト: 1",
      default: "1",
    },
    query: {
      type: "string",
      description: "hop 近傍ページを本文キーワードで絞り込む",
      default: "",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; hops: string; query: string }
    checkSandbox("page.context", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --hops バリデーション
    const hopsNum = Number(a.hops)
    if (!(VALID_HOPS as readonly number[]).includes(hopsNum)) {
      writeErrorJson(
        "VALIDATION_ERROR",
        `--hops=${a.hops} は無効な値です`,
        `有効な値: ${VALID_HOPS.join(", ")}`,
      )
      exitWithError(5, "VALIDATION_ERROR")
    }
    const hops = hopsNum as Hops

    const client = await buildRestClient(a)
    const rawText = await getSmartContext(client, { project, title: a.title, hops })
    const text = filterSmartContextByQuery(rawText, a.query)

    if (a.json) {
      writeJson({ text }, { command: "page.context", startTime }, buildJsonOpts(a))
      return
    }

    if (text) {
      process.stdout.write(`${text}\n`)
    }
  },
})
