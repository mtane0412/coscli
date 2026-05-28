/**
 * skill-doc.test.ts — .agents/skills/coscli/SKILL.md と実コマンドツリーの整合性テスト。
 *
 * SKILL.md の bash コードブロック内に登場する `cos <noun> [<verb> [<verb2>]]` 呼び出しが
 * 実際の citty コマンドツリーに存在することを検証する。
 * コマンド追加・変更・削除時に SKILL.md が古びると失敗する。
 */

import { describe, expect, it } from "bun:test"
import { rootSubCommands } from "@/commands/index"
import { buildSchema } from "@/core/schema"
import type { SchemaCommand } from "@/core/schema"
import { defineCommand } from "citty"

/** テスト用ルートコマンド（実 rootSubCommands を使用） */
const testRoot = defineCommand({
  meta: { name: "cos", version: "test", description: "test" },
  args: {},
  subCommands: rootSubCommands,
})

/**
 * collectAllPaths は SchemaCommand ツリーを DFS で走査し、
 * すべての有効なコマンドパス文字列（空白区切り、先頭の "cos" を除く）を Set で返す。
 *
 * 例: "page", "page list", "page ls", "page line replace", "page snapshot get"
 */
function collectAllPaths(node: SchemaCommand, prefix: string[] = []): Set<string> {
  const result = new Set<string>()
  const here = [...prefix, node.name]
  // canonical path (先頭の "cos" を除いた部分)
  const canonical = here.slice(1).join(" ")
  if (canonical) result.add(canonical)
  // alias paths (現ノードの alias を prefix + alias で展開)
  for (const alias of node.aliases) {
    const aliasParts = [...prefix.slice(1), alias]
    const aliasPath = aliasParts.join(" ")
    if (aliasPath) result.add(aliasPath)
  }
  // 再帰
  for (const sub of node.subCommands) {
    for (const p of collectAllPaths(sub, here)) {
      result.add(p)
    }
  }
  return result
}

/**
 * tokenize は文字列をシェルトークン列に分割する（簡易版）。
 * 引用符 (`"` / `'`) 内の空白は単一トークンとして扱う。
 */
function tokenize(str: string): string[] {
  const tokens: string[] = []
  let current = ""
  let inSingle = false
  let inDouble = false

  for (const ch of str) {
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble
    } else if (ch === " " && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current)
        current = ""
      }
    } else {
      current += ch
    }
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

/**
 * isBareToken はトークンが bare な noun/verb であるかを判定する。
 * bare token: `[a-z]` で始まり、英小文字・数字・ハイフンのみで構成される。
 */
function isBareToken(token: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(token)
}

/**
 * 位置引数としてコマンドパスを受け取るリーフコマンド。
 * `cos schema page list` のような呼び出しでは `schema` のみを取得し、
 * `page list` を誤ってサブコマンドと解釈しないようにする。
 */
const LEAF_COMMANDS_WITH_PATH_ARGS = new Set(["schema"])

/**
 * extractPath はトークン列から `<noun> [<verb> [<verb2>]]` を抽出する。
 *
 * ルートフラグ (`-` / `--` 始まり) はその引数ごと skip する。
 * フラグの引数は bare token であっても常に skip する (`--sort updated` 等の誤採取防止)。
 * `schema` のようなリーフコマンドは noun のみで停止する。
 */
function extractPath(tokens: string[]): string | null {
  const bare: string[] = []
  let i = 0

  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok === undefined) break

    if (tok.startsWith("-")) {
      // フラグ処理: `=` 含むなら引数なし。含まないなら次の非ダッシュトークンをフラグの引数として skip
      if (tok.includes("=")) {
        i++
        continue
      }
      i++
      const nextTok = tokens[i]
      if (nextTok !== undefined && !nextTok.startsWith("-")) {
        // bare token であっても常にフラグ引数として消費する (--sort updated 等)
        i++
      }
      continue
    }

    // `$` / 引用符 / 非 bare → コマンド部分の終わり
    if (tok.startsWith("$") || tok.startsWith('"') || tok.startsWith("'")) break
    if (!isBareToken(tok)) break

    bare.push(tok)
    // `schema` など位置引数としてパスを受け取るリーフコマンドは noun のみで停止
    if (bare.length === 1 && LEAF_COMMANDS_WITH_PATH_ARGS.has(tok)) break
    // noun + verb + verb2 の最大 3 トークンまで
    if (bare.length >= 3) break
    i++
  }

  if (bare.length === 0) return null
  return bare.join(" ")
}

/**
 * extractCommandsFromSkillDoc は SKILL.md の bash コードブロック内に登場する
 * `cos <noun> [<verb> [<verb2>]]` パターンを Set で返す。
 *
 * 対象: ```bash / ```sh / ``` (言語タグなし) のみ。JSON / TS 等のブロックは除外。
 * コメント行 (`#` で始まる行) は除外。サブシェル内の cos 呼び出しも対象。
 */
function extractCommandsFromSkillDoc(text: string): Set<string> {
  const result = new Set<string>()
  // fenced code block を抽出 (```bash / ```sh / ``` のみ)
  const fencePattern = /^```(?:bash|sh)?\s*\n([\s\S]*?)^```/gm

  for (const fenceMatch of text.matchAll(fencePattern)) {
    const block = fenceMatch[1] ?? ""
    for (const rawLine of block.split("\n")) {
      const line = rawLine.trim()
      // コメント行を除外
      if (line.startsWith("#")) continue

      // 行内の `cos ` 呼び出しをすべて検索 (g フラグでサブシェル内も対象)
      const cosPattern = /\bcos\s+/g
      for (const cosMatch of line.matchAll(cosPattern)) {
        const rest = line.slice((cosMatch.index ?? 0) + cosMatch[0].length)
        const tokens = tokenize(rest)
        const path = extractPath(tokens)
        if (path) result.add(path)
      }
    }
  }

  return result
}

describe("SKILL.md と citty コマンドツリーの整合性", () => {
  it("SKILL.md に登場する cos 呼び出しはすべて実コマンドに存在する", async () => {
    // 実コマンドツリーからすべての有効パスを収集する
    const schema = await buildSchema(testRoot, "cos")
    const knownPaths = collectAllPaths(schema)

    // SKILL.md からコマンドパスを抽出する
    const skillText = await Bun.file(".agents/skills/coscli/SKILL.md").text()
    const usedPaths = extractCommandsFromSkillDoc(skillText)

    // 未知のパスを検出する
    const unknown = [...usedPaths].filter((p) => !knownPaths.has(p))

    expect(unknown).toEqual([])
  })
})
