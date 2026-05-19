/**
 * cli-context.ts — ルートフラグ評価と環境変数注入。
 *
 * cli.ts の setup() ロジックを純粋関数として分離し、
 * --json/--plain の排他チェックと環境変数への伝播を担当する。
 */

import { initColor } from "@/infra/color"

/** RootArgs はルートコマンドが受け取るフラグの型。 */
export interface RootArgs {
  "enable-commands"?: string
  "disable-commands"?: string
  color?: string
  json: boolean
  plain: boolean
  "results-only": boolean
  select?: string
}

/**
 * applyRootContext はルートフラグを評価して環境変数へ注入し、グローバル状態 (initColor) を初期化する。
 * --json と --plain の同時指定は exit 5 で終了する。
 */
export function applyRootContext(args: RootArgs, env: NodeJS.ProcessEnv): void {
  // 色初期化
  const colorMode = (args.color ?? "auto") as "auto" | "always" | "never"
  initColor(colorMode)

  // --json と --plain は相互排他
  if (args.json === true && args.plain === true) {
    process.stderr.write("error: --json と --plain は同時に指定できません\n")
    process.exit(5)
    return
  }

  // sandbox ポリシーのプリセット設定を環境変数に反映する
  // 実際の判定は各コマンドの checkSandbox() で行う
  if (args["enable-commands"]) {
    env["COS_ENABLE_COMMANDS"] = args["enable-commands"]
  }
  if (args["disable-commands"]) {
    env["COS_DISABLE_COMMANDS"] = args["disable-commands"]
  }

  // 出力制御フラグを環境変数経由でサブコマンドへ伝播する
  // buildLogger / buildJsonOpts がこれらの環境変数を参照する
  if (args.json === true) env["COS_JSON"] = "1"
  if (args.plain === true) env["COS_PLAIN"] = "1"
  if (args["results-only"] === true) env["COS_RESULTS_ONLY"] = "1"
  if (args.select) env["COS_SELECT"] = args.select
}
