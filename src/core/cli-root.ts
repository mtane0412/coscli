/**
 * cli-root.ts — CLI ルートコマンド定義の singleton レジストリ。
 *
 * cli.ts の循環依存を避けるため、ルートコマンド参照を singleton として管理する。
 * cli.ts が main を組み立てた後に setRootCommand() を呼び出す。
 * schema コマンドは getRootCommand() でルートを取得する。
 */

import type { CommandDef } from "citty"

let _rootCommand: CommandDef | null = null

/**
 * setRootCommand はルートコマンドを登録する。
 * cli.ts の runMain 呼び出し前に呼ぶこと。
 */
export function setRootCommand(cmd: CommandDef): void {
  _rootCommand = cmd
}

/**
 * getRootCommand はルートコマンドを返す。
 * setRootCommand() が未呼び出しの場合は Error を throw する。
 */
export function getRootCommand(): CommandDef {
  if (!_rootCommand) {
    throw new Error("ルートコマンドが未初期化です。setRootCommand() を先に呼んでください。")
  }
  return _rootCommand
}
