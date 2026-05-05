/**
 * help.ts — citty のヘルプ表示における USAGE バイナリパス露出問題のワークアラウンド。
 *
 * citty 0.1.6 の renderUsage は以下の2問題を持つ:
 * 1. cmdMeta.name 未設定時に process.argv[1] (バイナリパス) にフォールバックする
 * 2. resolveSubCommand が親を1階層しか伝播しない (3階層目でルート名を失う)
 *
 * 本モジュールは rawArgs から完全なコマンドパスを再構築し、
 * 合成 parent を使って citty の公開 renderUsage を正しく呼び出す。
 */

import { type showUsage as cittyShowUsage, renderUsage } from "citty"
import type { CommandDef, Resolvable } from "citty"
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
 * resolveCommandPath は rawArgs を辿り、どのコマンドが対象かを解決する。
 *
 * citty の resolveSubCommand と異なり、ルートからのフルパスを pathSegments に保持する。
 * 未知のサブコマンドが現れた場合は graceful にその手前で停止し、親コマンドを返す。
 */
export async function resolveCommandPath(
  rootCmd: CommandDef,
  rootName: string,
  rawArgs: string[],
): Promise<ResolvedCommand> {
  const pathSegments: string[] = [rootName]
  let currentCmd: CommandDef = rootCmd

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]
    // フラグ (--, -x 形式) はスキップ
    if (arg === undefined || arg.startsWith("-")) {
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

  return renderUsage(cmdWithName, syntheticParent)
}

/**
 * createCustomShowUsage は runMain の showUsage オプションに渡せるクロージャを生成する。
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
