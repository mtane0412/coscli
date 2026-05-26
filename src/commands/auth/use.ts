/**
 * auth/use.ts — `cos auth use` コマンド。
 *
 * config.defaultProfile を更新してデフォルト認証プロファイルを切り替える。
 * 存在しないプロファイル指定は exit 4 + PROFILE_NOT_FOUND。
 * --unset で defaultProfile を削除する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
  exitWithError,
} from "@/commands/_shared"
import type { CredentialStore } from "@/core/auth/credential-store"
import { TokenStoreCredentialAdapter } from "@/core/auth/credential-store"
import { defaultConfigPath, loadConfig, saveConfig } from "@/infra/config"
import { createTokenStore } from "@/infra/keychain/index"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** AuthUseCommandDeps は createAuthUseCommand に注入できる依存。テスト専用。 */
export interface AuthUseCommandDeps {
  /** configPath は設定ファイルパスの上書き。未指定時はデフォルトパスを使用する。 */
  configPath?: string
  /** createCredStore は CredentialStore を生成する関数。未指定時は OS keychain を使用する。 */
  createCredStore?: () => CredentialStore
}

/** createAuthUseCommand は依存を注入して use コマンドを生成する。 */
export function createAuthUseCommand(deps: AuthUseCommandDeps = {}) {
  const getConfigPath = () => deps.configPath ?? defaultConfigPath()
  const getCredStore = () =>
    deps.createCredStore
      ? deps.createCredStore()
      : new TokenStoreCredentialAdapter(createTokenStore())

  return defineCommand({
    meta: {
      name: "use",
      description: "デフォルト認証プロファイルを切り替える",
    },
    args: {
      ...commonArgs,
      unset: {
        type: "boolean",
        description: "defaultProfile を削除する",
        default: false,
      },
    },
    async run({ args }) {
      type UseArgs = CommonArgs & { unset: boolean }
      const a = args as UseArgs
      checkSandbox("auth.use", a)
      const logger = buildLogger(a)
      const startTime = Date.now()

      const configPath = getConfigPath()
      const config = loadConfig(configPath)

      if (a.unset) {
        // defaultProfile を削除する
        const { defaultProfile: _removed, ...rest } = config
        saveConfig(rest, configPath)
        logger.success("defaultProfile を削除しました")
        if (a.json) {
          writeJson({ defaultProfile: null }, { command: "auth.use", startTime }, buildJsonOpts(a))
        }
        return
      }

      const profileName = a.profile
      if (!profileName) {
        writeErrorJson(
          "PROFILE_REQUIRED",
          "プロファイル名が指定されていません",
          "--profile (-p) フラグでプロファイル名を指定してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }

      // プロファイルの存在確認
      const credStore = getCredStore()
      const cred = await credStore.load(profileName)
      if (cred === null) {
        writeErrorJson(
          "PROFILE_NOT_FOUND",
          `プロファイル "${profileName}" は登録されていません`,
          "`cos auth list` で登録済みプロファイルを確認してください",
        )
        exitWithError(4, "PROFILE_NOT_FOUND")
      }

      saveConfig({ ...config, defaultProfile: profileName }, configPath)
      logger.success(`デフォルトプロファイルを "${profileName}" に設定しました`)

      if (a.json) {
        writeJson(
          { defaultProfile: profileName },
          { command: "auth.use", startTime },
          buildJsonOpts(a),
        )
      }
    },
  })
}

/** authUseCommand は OS keychain を使うデフォルト実装。 */
export const authUseCommand = createAuthUseCommand()
