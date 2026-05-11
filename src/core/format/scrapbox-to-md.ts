/**
 * scrapbox-to-md.ts — Scrapbox 記法を Markdown に変換する。
 *
 * @progfay/scrapbox-parser で AST に変換してから Markdown 文字列に直列化する。
 * タイトル行 (先頭行) は h1 に変換する。
 */

import type {
  Block,
  CodeBlock,
  DecorationNode,
  Line,
  Node,
  StrongNode,
  Table,
  Title,
} from "@progfay/scrapbox-parser"
import { parse } from "@progfay/scrapbox-parser"

export type BoldStyle = "auto" | "heading" | "emphasis"

export interface ScrapboxToMdOptions {
  /** 太字記法の解釈モード (デフォルト: "auto") */
  boldStyle?: BoldStyle
}

/**
 * scrapboxToMd は Scrapbox 記法テキストを Markdown 文字列に変換する。
 *
 * @param input Scrapbox ページ本文 (先頭行がタイトル)
 * @param opts 変換オプション
 */
export function scrapboxToMd(input: string, opts: ScrapboxToMdOptions = {}): string {
  const boldStyle = opts.boldStyle ?? "auto"
  const blocks = parse(input, { hasTitle: true })
  const lines: string[] = []

  for (const block of blocks) {
    const converted = blockToMd(block, boldStyle)
    lines.push(converted)
  }

  return lines.join("\n")
}

/** blockToMd はブロックを Markdown 行(群)に変換する。 */
function blockToMd(block: Block, boldStyle: BoldStyle): string {
  switch (block.type) {
    case "title":
      return titleToMd(block)
    case "codeBlock":
      return codeBlockToMd(block)
    case "table":
      return tableToMd(block)
    case "line":
      return lineToMd(block, boldStyle)
    default: {
      const _exhaustive: never = block
      return ""
    }
  }
}

/** titleToMd は Title ブロックを h1 に変換する。 */
function titleToMd(title: Title): string {
  return `# ${title.text}\n`
}

/** codeBlockToMd は CodeBlock ブロックをコードフェンスに変換する。 */
function codeBlockToMd(block: CodeBlock): string {
  const lang = block.fileName ?? ""
  return `\`\`\`${lang}\n${block.content}\n\`\`\``
}

/** tableToMd は Table ブロックを Markdown テーブルに変換する (未サポート: そのまま raw 形式)。 */
function tableToMd(block: Table): string {
  // Scrapbox テーブルは複雑なため簡易変換
  const header = block.cells[0]?.map((cell) => nodesRaw(cell)).join(" | ") ?? ""
  const separator = block.cells[0]?.map(() => "---").join(" | ") ?? ""
  const bodyRows = block.cells.slice(1).map((row) => row.map((cell) => nodesRaw(cell)).join(" | "))
  return [`| ${header} |`, `| ${separator} |`, ...bodyRows.map((r) => `| ${r} |`)].join("\n")
}

/** lineToMd は Line ブロックを Markdown の 1 行に変換する。 */
function lineToMd(line: Line, boldStyle: BoldStyle): string {
  if (line.nodes.length === 0) return ""

  const indent = line.indent
  const indentStr = "\t".repeat(indent)

  // auto / heading モード: インデントなし かつ 行全体が単一の DecorationNode なら見出し
  if (
    (boldStyle === "auto" || boldStyle === "heading") &&
    indent === 0 &&
    isSingleDecoration(line)
  ) {
    const deco = line.nodes[0] as DecorationNode
    const heading = tryHeading(deco)
    if (heading !== null) {
      const text = nodesToMd(deco.nodes, boldStyle)
      return `${"#".repeat(heading)} ${text}`
    }
  }

  const content = nodesToMd(line.nodes, boldStyle)
  return `${indentStr}${content}`
}

/** isSingleDecoration は Line の nodes が単一の DecorationNode かを判定する。 */
function isSingleDecoration(line: Line): boolean {
  return line.nodes.length === 1 && line.nodes[0]?.type === "decoration"
}

/**
 * tryHeading は DecorationNode が見出しに変換可能かを判定する。
 * 変換可能なら Markdown の # レベル数を返す。変換不可なら null を返す。
 */
function tryHeading(deco: DecorationNode): number | null {
  const level = getAsteriskLevel(deco.decos)
  if (level === 0) return null
  // level 1 → h4(4), level 2 → h3(3), level 3+ → h2(2)
  if (level >= 3) return 2
  if (level === 2) return 3
  return 4
}

/** getAsteriskLevel は decos から "*-N" パターンを見つけて N を返す。なければ 0。 */
function getAsteriskLevel(decos: string[]): number {
  for (const deco of decos) {
    const m = deco.match(/^\*-(\d+)$/)
    if (m?.[1] !== undefined) return Number.parseInt(m[1], 10)
  }
  return 0
}

/** nodesToMd は Node 配列を Markdown 文字列に直列化する。 */
function nodesToMd(nodes: Node[], boldStyle: BoldStyle): string {
  return nodes.map((node) => nodeToMd(node, boldStyle)).join("")
}

/** nodeToMd は Node を Markdown 文字列に変換する。 */
function nodeToMd(node: Node, boldStyle: BoldStyle): string {
  switch (node.type) {
    case "plain":
      return node.text
    case "blank":
      return node.text
    case "decoration":
      return decorationNodeToMd(node, boldStyle)
    case "code":
      return `\`${node.text}\``
    case "link":
      if (node.pathType === "absolute") {
        // 外部 URL
        if (node.content) return `[${node.content}](${node.href})`
        return `<${node.href}>`
      }
      // 内部リンク (relative/root)
      if (node.content) return `[${node.content}](${node.href})`
      return `[${node.href}](${node.href})`
    case "hashTag":
      return `#${node.href}`
    case "formula":
      return `$${node.formula}$`
    case "quote":
      // nodes のテキストは先頭スペースを含むため trimStart する
      return `> ${nodesToMd(node.nodes, boldStyle).trimStart()}`
    case "image":
      return node.link ? `[![](${node.src})](${node.link})` : `![](${node.src})`
    case "strongImage":
      return `![](${node.src})`
    case "icon":
      return `![${node.path}](${node.path})`
    case "strongIcon":
      return `![${node.path}](${node.path})`
    case "numberList":
      return `${node.number}. ${nodesToMd(node.nodes, boldStyle)}`
    case "commandLine":
      return `\`${node.symbol} ${node.text}\``
    case "helpfeel":
      return `? ${node.text}`
    case "strong":
      return strongNodeToMd(node, boldStyle)
    case "googleMap":
      return `[${node.place}](${node.url})`
    default: {
      const _exhaustive: never = node
      return (node as { raw: string }).raw ?? ""
    }
  }
}

/** decorationNodeToMd は DecorationNode を Markdown 装飾に変換する。 */
function decorationNodeToMd(node: DecorationNode, boldStyle: BoldStyle): string {
  const text = nodesToMd(node.nodes, boldStyle)
  const decos = node.decos

  // インライン or インデント下の装飾はスタイルに関わらず太字
  const asteriskLevel = getAsteriskLevel(decos)
  if (asteriskLevel > 0) {
    return `**${text}**`
  }

  // italic
  if (decos.includes("/")) return `*${text}*`
  // strikethrough
  if (decos.includes("-")) return `~~${text}~~`
  // underline
  if (decos.includes("_")) return `<u>${text}</u>`

  // 未知の装飾: そのまま raw
  return node.raw
}

/** strongNodeToMd は StrongNode (二重角括弧 [[...]]) を太字に変換する。 */
function strongNodeToMd(node: StrongNode, boldStyle: BoldStyle): string {
  return `**${nodesToMd(node.nodes, boldStyle)}**`
}

/** nodesRaw は Node 配列の raw テキストを返す (テーブル用)。 */
function nodesRaw(nodes: Node[]): string {
  return nodes.map((n) => ("raw" in n ? (n as { raw: string }).raw : "")).join("")
}
