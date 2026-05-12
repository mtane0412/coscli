/**
 * schema.ts — citty CommandDef を再帰走査して JSON 互換スキーマを構築する純関数。
 *
 * エージェント向け `cos schema` コマンドの出力源。
 * Resolvable<T> の解決と alias グルーピングに src/infra/help.ts のユーティリティを使用する。
 */

import { groupSubCommandsByAlias, resolveValue } from "@/infra/help"
import type { ArgsDef, CommandDef, Resolvable } from "citty"

/** SchemaArg はコマンド引数（フラグ・位置引数）1 個のスキーマ表現。 */
export interface SchemaArg {
  /** 引数名 */
  name: string
  /** 引数型 */
  type: "string" | "boolean" | "positional"
  /** 位置引数かどうか（type === "positional" のとき true） */
  positional: boolean
  /** 引数の説明 */
  description?: string
  /** alias リスト（string | string[] を string[] に正規化済み） */
  alias: string[]
  /** デフォルト値 */
  default?: string | boolean
  /** 必須かどうか（位置引数はデフォルト true、フラグはデフォルト false） */
  required: boolean
  /** 値のヒント文字列 */
  valueHint?: string
}

/** SchemaCommand はコマンド 1 つのスキーマ表現。 */
export interface SchemaCommand {
  /** コマンド名（canonical） */
  name: string
  /** alias キーのリスト（canonical を除く同一参照キー） */
  aliases: string[]
  /** コマンド説明 */
  description?: string
  /** フラグ一覧 */
  args: SchemaArg[]
  /** サブコマンド一覧 */
  subCommands: SchemaCommand[]
}

/**
 * normalizeAlias は citty の alias フィールド（string | string[] | undefined）を
 * string[] に正規化する。
 */
function normalizeAlias(alias: string | string[] | undefined): string[] {
  if (!alias) return []
  return typeof alias === "string" ? [alias] : alias
}

/** parseGroupKey の返り値 */
interface ParsedGroupKey {
  canonicalKey: string
  aliasKeys: string[]
}

/**
 * parseGroupKey は groupSubCommandsByAlias が返す
 * "canonical (alias1, alias2)" 形式のキーを canonical と alias リストに分離する。
 *
 * groupKey のフォーマット変更に対して堅牢になるよう正規表現で検証する。
 * 不正なフォーマットの場合は aliasKeys を空配列として安全にフォールバックする。
 */
function parseGroupKey(groupKey: string): ParsedGroupKey {
  const match = /^(.+?) \((.+)\)$/.exec(groupKey)
  if (!match) {
    return { canonicalKey: groupKey, aliasKeys: [] }
  }
  const canonicalKey = match[1] ?? groupKey
  const aliasKeys = (match[2] ?? "")
    .split(", ")
    .map((k) => k.trim())
    .filter(Boolean)
  return { canonicalKey, aliasKeys }
}

/**
 * buildArgsSchema は CommandDef の args を SchemaArg[] に変換する。
 */
async function buildArgsSchema(cmd: CommandDef): Promise<SchemaArg[]> {
  if (!cmd.args) return []
  const args = await resolveValue(cmd.args as Resolvable<ArgsDef>)
  if (!args) return []

  return Promise.all(
    Object.entries(args).map(async ([name, def]) => {
      const resolved = await resolveValue(
        def as Resolvable<{
          type?: string
          description?: string
          alias?: string | string[]
          default?: string | boolean
          required?: boolean
          valueHint?: string
        }>,
      )
      // type が "positional" の場合は positional フラグを true に設定する
      const argType = (resolved?.type ?? "string") as SchemaArg["type"]
      const isPositional = argType === "positional"
      // required は常に boolean で出力する。未指定の場合は位置引数なら true、フラグなら false
      const schemaArg: SchemaArg = {
        name,
        type: argType,
        positional: isPositional,
        required: resolved?.required ?? isPositional,
        alias: normalizeAlias(resolved?.alias),
      }
      if (resolved?.description !== undefined) schemaArg.description = resolved.description
      if (resolved?.default !== undefined) schemaArg.default = resolved.default
      if (resolved?.valueHint !== undefined) schemaArg.valueHint = resolved.valueHint
      return schemaArg
    }),
  )
}

/**
 * buildSchema は CommandDef を再帰走査して SchemaCommand を返す。
 *
 * @param cmd - 走査対象の CommandDef
 * @param rootName - コマンド名（meta.name が未設定の場合のフォールバック）
 * @param aliases - このコマンドが持つ alias キー一覧
 */
export async function buildSchema(
  cmd: CommandDef,
  rootName: string,
  aliases: string[] = [],
): Promise<SchemaCommand> {
  const meta = cmd.meta
    ? await resolveValue(cmd.meta as Resolvable<{ name?: string; description?: string }>)
    : null
  const name = meta?.name ?? rootName
  const argsSchema = await buildArgsSchema(cmd)

  const subCommandSchemas: SchemaCommand[] = []
  if (cmd.subCommands) {
    const subs = await resolveValue(cmd.subCommands)
    if (subs && Object.keys(subs).length > 0) {
      // 同一参照を canonical + aliases にまとめる
      const grouped = await groupSubCommandsByAlias(subs)
      for (const [groupKey, subCmd] of Object.entries(grouped)) {
        const resolved = await resolveValue(subCmd)
        // groupKey は groupSubCommandsByAlias が生成する "canonical (alias1, alias2)" 形式
        const { canonicalKey, aliasKeys } = parseGroupKey(groupKey)
        const subSchema = await buildSchema(resolved, canonicalKey, aliasKeys)
        subCommandSchemas.push(subSchema)
      }
    }
  }

  const schema: SchemaCommand = {
    name,
    aliases,
    args: argsSchema,
    subCommands: subCommandSchemas,
  }
  if (meta?.description !== undefined) schema.description = meta.description
  return schema
}

/**
 * findCommandByPath は path に従って CommandDef ツリーを下降し、
 * 対象コマンドの SchemaCommand を返す。
 *
 * @param rootCmd - ルートの CommandDef
 * @param rootName - ルートのコマンド名
 * @param path - コマンドパス（例: ["page", "list"]）
 * @returns 見つかった SchemaCommand、または未知パスの場合 null
 */
export async function findCommandByPath(
  rootCmd: CommandDef,
  rootName: string,
  path: string[],
): Promise<SchemaCommand | null> {
  if (path.length === 0) {
    return buildSchema(rootCmd, rootName)
  }

  let currentCmd: CommandDef = rootCmd
  let currentName = rootName
  const resolvedPath: string[] = []

  for (const segment of path) {
    if (!currentCmd.subCommands) return null
    const subs = await resolveValue(currentCmd.subCommands)
    if (!subs) return null

    const subCmd = subs[segment]
    if (!subCmd) return null

    currentCmd = await resolveValue(subCmd)
    // canonical 名は meta.name を優先
    const meta = currentCmd.meta
      ? await resolveValue(currentCmd.meta as Resolvable<{ name?: string }>)
      : null
    currentName = meta?.name ?? segment
    resolvedPath.push(segment)
  }

  return buildSchema(currentCmd, currentName)
}
