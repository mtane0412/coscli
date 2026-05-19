/**
 * sandbox/resolve.ts — サンドボックスポリシー解決の純粋関数。
 *
 * CLI フラグ・環境変数・設定ファイルの 3 系統から enable/disable 文字列を解決する。
 * 副作用を持たないため、テストが容易で checkSandbox から依存注入できる。
 *
 * 優先順位: CLI フラグ > 環境変数 > プロジェクト固有設定 > defaultPermission > 全許可
 */

import { expandPermissionPreset } from "@/core/command-classification"
import type { CoscliConfig } from "@/infra/config"

/** ResolvePolicyInput は副作用源 (CLI / env / config) を引数として受け取るための入力型。 */
export interface ResolvePolicyInput {
  cli: {
    enable?: string
    disable?: string
    project?: string
  }
  env: {
    COS_ENABLE_COMMANDS?: string
    COS_DISABLE_COMMANDS?: string
    COS_PROJECT?: string
  }
  config: CoscliConfig
}

/** ResolvedPolicy は createPolicy に渡すための解決済み文字列。 */
export interface ResolvedPolicy {
  enableStr?: string
  disableStr?: string
}

/**
 * resolvePolicy はサンドボックスポリシー解決の純粋関数。
 *
 * 優先順位: CLI フラグ > 環境変数 > プロジェクト固有設定 > defaultPermission > 全許可
 * - CLI/env フラグが指定された場合は config を無視する
 * - プロジェクト固有 permission / enableCommands / disableCommands はグローバルより優先
 * - defaultPermission はプロジェクト指定時のみ有効
 * - config.disableCommands は CLI/env 未指定時のみプロジェクト設定に重ねて適用する
 */
export function resolvePolicy(input: ResolvePolicyInput): ResolvedPolicy {
  const { cli, env, config } = input

  // プロジェクト名解決 (CLI > 環境変数、config.defaultProject は使用しない)
  const projectName = cli.project ?? env.COS_PROJECT
  const projectConfig = projectName ? (config.projects?.[projectName] ?? undefined) : undefined

  const cliEnable = cli.enable
  const envEnable = env.COS_ENABLE_COMMANDS
  const cliDisable = cli.disable
  const envDisable = env.COS_DISABLE_COMMANDS

  let enableStr: string | undefined
  let disableStr: string | undefined

  const hasCliOrEnvOverride =
    cliEnable !== undefined ||
    envEnable !== undefined ||
    cliDisable !== undefined ||
    envDisable !== undefined

  if (hasCliOrEnvOverride) {
    // CLI/env フラグが指定された場合は config を無視 (enable と disable は独立して解決する)
    enableStr = cliEnable ?? envEnable
    disableStr = cliDisable ?? envDisable
  } else {
    // config からプロジェクト固有 → defaultPermission の順で解決
    if (projectConfig?.permission) {
      const { enable, disable } = expandPermissionPreset(projectConfig.permission)
      enableStr = enable?.join(",")
      disableStr = disable?.join(",")
      // permission プリセットに対して enableCommands/disableCommands を追加合成する
      if (projectConfig.enableCommands?.length) {
        const extra = projectConfig.enableCommands.join(",")
        enableStr = enableStr ? `${enableStr},${extra}` : extra
      }
      if (projectConfig.disableCommands?.length) {
        const extra = projectConfig.disableCommands.join(",")
        disableStr = disableStr ? `${disableStr},${extra}` : extra
      }
    } else if (
      projectConfig?.enableCommands !== undefined ||
      projectConfig?.disableCommands !== undefined
    ) {
      enableStr = projectConfig.enableCommands?.join(",")
      disableStr = projectConfig.disableCommands?.join(",")
    } else if (projectName && config.defaultPermission) {
      const { enable, disable } = expandPermissionPreset(config.defaultPermission)
      enableStr = enable?.join(",")
      disableStr = disable?.join(",")
    }

    // 絶対禁止リストを重ねる (CLI/env 未指定時のみ)
    if (config.disableCommands?.length) {
      const globalDisable = config.disableCommands.join(",")
      disableStr = disableStr ? `${disableStr},${globalDisable}` : globalDisable
    }
  }

  const result: ResolvedPolicy = {}
  if (enableStr !== undefined) result.enableStr = enableStr
  if (disableStr !== undefined) result.disableStr = disableStr
  return result
}
