/**
 * help.ts — citty のヘルプ表示における USAGE バイナリパス露出問題のワークアラウンド。
 *
 * citty 0.1.6 の renderUsage は以下の2問題を持つ:
 * 1. cmdMeta.name 未設定時に process.argv[1] (バイナリパス) にフォールバックする
 * 2. resolveSubCommand が親を1階層しか伝播しない (3階層目でルート名を失う)
 *
 * 加えて、subCommands に同一オブジェクト参照を複数キーで登録すると alias が
 * 重複行として表示されてしまう問題を groupSubCommandsByAlias で解消する。
 *
 * 本モジュールは rawArgs から完全なコマンドパスを再構築し、
 * 合成 parent を使って citty の公開 renderUsage を正しく呼び出す。
 */

import { type showUsage as cittyShowUsage, renderUsage } from "citty"
import type { ArgsDef, CommandDef, Resolvable, SubCommandsDef } from "citty"
import consola from "consola"

/** resolveCommandPath の返り値 */
export type ResolvedCommand = {
  /** 末端の解決済みコマンド */
  cmd: CommandDef
  /** ルートから末端までのコマンドパス。例: ["cos", "page", "list"] */
  pathSegments: string[]
}

/**
 * resolveValue は Resolvable<T> を解決する。
 * citty の Resolvable<T> = T | Promise<T> | (() => T) | (() => Promise<T>) に対応する。
 */
async function resolveValue<T>(value: Resolvable<T>): Promise<T> {
  if (typeof value === "function") {
    return (value as (() => T) | (() => Promise<T>))()
  }
  return value
}

/**
 * getStringFlagNames はコマンドの args から文字列型フラグ名のセットを返す。
 *
 * boolean 型と positional 型以外のフラグは値を必要とするため、セットに含める。
 * エイリアスも含む。
 */
async function getStringFlagNames(cmd: CommandDef): Promise<Set<string>> {
  if (!cmd.args) return new Set()
  const args = await resolveValue(cmd.args as Resolvable<ArgsDef>)
  const result = new Set<string>()
  for (const [name, def] of Object.entries(args ?? {})) {
    const resolved = await resolveValue(def as Resolvable<{ type?: string; alias?: string[] }>)
    const type = resolved?.type
    // boolean 型と positional 型以外はフラグ値を次トークンとして必要とする
    if (type !== "boolean" && type !== "positional") {
      result.add(name)
      if (resolved?.alias) {
        for (const a of resolved.alias) result.add(a)
      }
    }
  }
  return result
}

/**
 * resolveCommandPath は rawArgs を辿りコマンドパスを解決した ResolvedCommand を返す。
 *
 * citty の resolveSubCommand と異なり、ルートからのフルパスを pathSegments に保持する。
 * 文字列型フラグの値トークンをスキップすることで、`--flag value subcommand` 形式にも対応する。
 * 未知のサブコマンドが現れた場合は graceful にその手前で停止し、親コマンドを返す。
 */
export async function resolveCommandPath(
  rootCmd: CommandDef,
  rootName: string,
  rawArgs: string[],
): Promise<ResolvedCommand> {
  const pathSegments: string[] = [rootName]
  let currentCmd: CommandDef = rootCmd
  let stringFlagNames = await getStringFlagNames(currentCmd)

  let i = 0
  while (i < rawArgs.length) {
    const arg = rawArgs[i]
    if (arg === undefined) {
      i++
      continue
    }

    if (arg.startsWith("-")) {
      // --flag=value 形式はそのまま 1 トークンでスキップ
      if (!arg.includes("=")) {
        const flagName = arg.replace(/^-+/, "")
        // 文字列型フラグなら次のトークン (値) もスキップ
        if (stringFlagNames.has(flagName)) {
          i += 2
          continue
        }
      }
      i++
      continue
    }

    if (!currentCmd.subCommands) {
      // リーフコマンドに到達済み: positional arg はコマンドキーではない
      break
    }
    const subCommands = await resolveValue(currentCmd.subCommands)
    if (!subCommands || Object.keys(subCommands).length === 0) {
      break
    }

    const subCmd = subCommands[arg]
    if (subCmd === undefined) {
      // 未知のサブコマンド: graceful fallback
      break
    }

    const resolvedSubCmd = await resolveValue(subCmd)
    currentCmd = resolvedSubCmd
    pathSegments.push(arg)
    // サブコマンドに進んだら、新しいコマンドのフラグセットに更新
    stringFlagNames = await getStringFlagNames(currentCmd)
    i++
  }

  return { cmd: currentCmd, pathSegments }
}

/**
 * ensureMetaName は CommandDef の meta.name を強制的に設定したクローンを返す。
 *
 * exactOptionalPropertyTypes 対策として、meta オブジェクトを spread でクローンし
 * name を追加する。元の CommandDef は変更しない。
 */
function ensureMetaName(cmd: CommandDef, name: string): CommandDef {
  return {
    ...cmd,
    meta: { ...(cmd.meta as object), name },
  }
}

/**
 * groupSubCommandsByAlias は同一オブジェクト参照を共有する複数のキーを
 * `canonical (alias1, alias2)` 形式の単一キーにまとめた新しい subCommands を返す。
 *
 * canonical キーの判定優先順位:
 *   1. resolved meta.name と一致するキー
 *   2. 最初に出現したキー (フォールバック)
 *
 * 元の subCommands は変更しない。並び順は canonical キーの初出位置を保持する。
 * alias を持たない場合は元のキーをそのまま使用する。
 */
async function groupSubCommandsByAlias(
  subCommands: SubCommandsDef,
): Promise<Record<string, Resolvable<CommandDef>>> {
  // 同一参照ごとにキーをまとめる: Map<CommandDef オブジェクト, キー名リスト>
  const refToKeys = new Map<CommandDef, string[]>()
  // 各参照の初出順序を保持する配列
  const refOrder: CommandDef[] = []

  for (const [key, sub] of Object.entries(subCommands)) {
    const resolved = await resolveValue(sub as Resolvable<CommandDef>)
    if (!refToKeys.has(resolved)) {
      refToKeys.set(resolved, [])
      refOrder.push(resolved)
    }
    const keys = refToKeys.get(resolved)
    if (keys) {
      keys.push(key)
    }
  }

  const result: Record<string, Resolvable<CommandDef>> = {}

  for (const resolved of refOrder) {
    const keys = refToKeys.get(resolved) ?? []
    if (keys.length === 0) continue

    const meta = resolved.meta
      ? await resolveValue(resolved.meta as Resolvable<{ name?: string }>)
      : null
    const metaName = meta?.name

    // canonical キーを決定する
    const canonicalKey = (metaName && keys.includes(metaName) ? metaName : null) ?? keys[0] ?? ""
    const aliasKeys = keys.filter((k) => k !== canonicalKey)

    // alias がある場合は `canonical (alias1, alias2)` 形式、ない場合はそのまま
    const displayKey =
      aliasKeys.length > 0 ? `${canonicalKey} (${aliasKeys.join(", ")})` : canonicalKey

    result[displayKey] = resolved
  }

  return result
}

/**
 * renderUsageForArgs は rawArgs を元にヘルプ文字列を生成して返す純関数。
 *
 * citty の公開 renderUsage を使用するが、合成 parent を介してフルパスを注入することで
 * process.argv[1] フォールバックを回避する。
 */
export async function renderUsageForArgs(
  rootCmd: CommandDef,
  rootName: string,
  rawArgs: string[],
): Promise<string> {
  const { cmd, pathSegments } = await resolveCommandPath(rootCmd, rootName, rawArgs)
  const lastSegment = pathSegments.at(-1) ?? rootName
  const parentSegments = pathSegments.slice(0, -1)

  // 合成 parent: meta.name に "cos page" のような接頭辞を設定する
  // citty の renderUsage は `${parentMeta.name} ` + cmdMeta.name で commandName を構築するため
  const syntheticParent: CommandDef =
    parentSegments.length > 0 ? { meta: { name: parentSegments.join(" ") } } : { meta: {} }

  // citty の renderUsage が process.argv[1] にフォールバックしないよう meta.name を保証する
  const cmdWithName = ensureMetaName(cmd, lastSegment)

  // subCommands の alias を `canonical (alias)` 形式にグルーピングする
  if (cmdWithName.subCommands) {
    const originalSubCommands = await resolveValue(cmdWithName.subCommands as SubCommandsDef)
    const groupedSubCommands = await groupSubCommandsByAlias(originalSubCommands)
    return renderUsage({ ...cmdWithName, subCommands: groupedSubCommands }, syntheticParent)
  }

  return renderUsage(cmdWithName, syntheticParent)
}

/**
 * createCustomShowUsage は runMain の showUsage オプションに渡すクロージャを返す。
 *
 * citty の showUsage と同じシグネチャ (cmd, parent) を受け取るが、引数は無視し、
 * process.argv.slice(2) から自前でコマンドパスを再構築して正確な USAGE を表示する。
 *
 * 戻り値の型は citty の showUsage と同一 (typeof cittyShowUsage) にして
 * runMain の showUsage オプションとして直接渡せるようにする。
 */
export function createCustomShowUsage(
  rootCmd: CommandDef,
  rootName: string,
): typeof cittyShowUsage {
  const fn = async () => {
    const rawArgs = process.argv.slice(2)
    const out = await renderUsageForArgs(rootCmd, rootName, rawArgs)
    consola.log(`${out}\n`)
  }
  // citty の showUsage は generic 関数だが、引数を使わない実装のため安全にキャストする
  return fn as typeof cittyShowUsage
}
