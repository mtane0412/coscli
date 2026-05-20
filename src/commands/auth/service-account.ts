/**
 * auth/service-account.ts — `cos auth sa` サブコマンドグループ。
 *
 * Cosense Business Plan の Service Account Access Key を管理する。
 * キーは設定ファイル (serviceAccounts フィールド) に保存する。
 *
 * サブコマンド:
 *   add    --project <name> --key <key>  キーを登録して API 検証する
 *   delete --project <name>              登録済みキーを削除する
 *   list                                 登録済みプロジェクト一覧を表示する
 */

import {
  type CommonArgs,
  ServiceAccountKeyValidationError,
  assertValidServiceAccountKey,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
  showUsageIfNoSubCommand,
} from "@/commands/_shared"
import { AuthError, CosenseRestClient, ForbiddenError } from "@/core/api/rest"
import type { CoscliConfig } from "@/infra/config"
import { defaultConfigPath, loadConfig, saveConfig } from "@/infra/config"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** AuthSaCommandDeps は createAuthSa* コマンドファクトリに注入できる依存。テスト専用。 */
export interface AuthSaCommandDeps {
  /**
   * configPath は設定ファイルパスの上書き。
   * テスト時は一時ファイルパスを渡して実設定ファイルを汚染しないようにする。
   */
  configPath?: string
}

/**
 * createAuthSaAddCommand は auth sa add コマンド定義を返すファクトリ。
 * deps を省略した場合は本番実装を使用する。
 */
export function createAuthSaAddCommand(deps: AuthSaCommandDeps = {}) {
  const getConfigPath = () => deps.configPath ?? defaultConfigPath()

  return defineCommand({
    meta: { name: "add", description: "Service Account キーを登録する" },
    args: {
      ...commonArgs,
      key: {
        type: "string",
        description: "Service Account Access Key (cs_ で始まる 67 文字)",
      },
    },
    async run({ args }) {
      type SaAddArgs = CommonArgs & { key?: string }
      const a = args as SaAddArgs
      checkSandbox("auth.sa.add", a)
      const logger = buildLogger(a)
      const startTime = Date.now()

      const project = a.project ?? process.env["COS_PROJECT"]
      if (!project) {
        writeErrorJson(
          "PROJECT_REQUIRED",
          "プロジェクト名が指定されていません",
          "--project (-p) フラグか COS_PROJECT 環境変数でプロジェクトを指定してください",
        )
        process.exit(5)
        return
      }

      if (!a.key) {
        writeErrorJson(
          "KEY_REQUIRED",
          "Service Account キーが指定されていません",
          "--key フラグで cs_ で始まる 67 文字のキーを指定してください",
        )
        process.exit(5)
        return
      }

      // キー形式を検証する
      try {
        assertValidServiceAccountKey(a.key)
      } catch (err) {
        if (err instanceof ServiceAccountKeyValidationError) {
          writeErrorJson("INVALID_SERVICE_ACCOUNT_KEY", err.message)
          process.exit(5)
          return
        }
        throw err
      }

      // API を呼び出してキーの有効性を確認する (pages API で検証)
      logger.info(`${project} の Service Account キーを確認中...`)
      const client = new CosenseRestClient({ serviceAccountKey: a.key })
      try {
        await client.listPages(project, { limit: 1 })
      } catch (err) {
        if (err instanceof AuthError) {
          writeErrorJson(
            "AUTH_ERROR",
            "Service Account キーが無効です。キーとプロジェクト名を確認してください",
          )
          process.exit(2)
          return
        }
        if (err instanceof ForbiddenError) {
          writeErrorJson(
            "FORBIDDEN",
            "このプロジェクトへのアクセス権限がありません",
            "プロジェクト名と Service Account キーを確認してください",
          )
          process.exit(3)
          return
        }
        throw err
      }

      // 設定ファイルに保存する
      const configPath = getConfigPath()
      const config = loadConfig(configPath)
      const updated: CoscliConfig = {
        ...config,
        serviceAccounts: {
          ...config.serviceAccounts,
          [project]: a.key,
        },
      }
      saveConfig(updated, configPath)

      logger.success(`${project} の Service Account キーを登録しました`)

      if (a.json) {
        writeJson({ project }, { command: "auth.sa.add", startTime }, buildJsonOpts(a))
      }
    },
  })
}

/**
 * createAuthSaDeleteCommand は auth sa delete コマンド定義を返すファクトリ。
 * deps を省略した場合は本番実装を使用する。
 */
export function createAuthSaDeleteCommand(deps: AuthSaCommandDeps = {}) {
  const getConfigPath = () => deps.configPath ?? defaultConfigPath()

  return defineCommand({
    meta: { name: "delete", description: "登録済み Service Account キーを削除する" },
    args: {
      ...commonArgs,
    },
    async run({ args }) {
      const a = args as CommonArgs
      checkSandbox("auth.sa.delete", a)
      const logger = buildLogger(a)
      const startTime = Date.now()

      const project = a.project ?? process.env["COS_PROJECT"]
      if (!project) {
        writeErrorJson(
          "PROJECT_REQUIRED",
          "プロジェクト名が指定されていません",
          "--project (-p) フラグか COS_PROJECT 環境変数でプロジェクトを指定してください",
        )
        process.exit(5)
        return
      }

      const configPath = getConfigPath()
      const config = loadConfig(configPath)
      // 該当プロジェクトのキーを削除して保存する
      const accounts = { ...config.serviceAccounts }
      delete accounts[project]
      const updated: CoscliConfig = { ...config, serviceAccounts: accounts }
      saveConfig(updated, configPath)

      logger.success(`${project} の Service Account キーを削除しました`)

      if (a.json) {
        writeJson({ project }, { command: "auth.sa.delete", startTime }, buildJsonOpts(a))
      }
    },
  })
}

/**
 * createAuthSaListCommand は auth sa list コマンド定義を返すファクトリ。
 * deps を省略した場合は本番実装を使用する。
 */
export function createAuthSaListCommand(deps: AuthSaCommandDeps = {}) {
  const getConfigPath = () => deps.configPath ?? defaultConfigPath()

  return defineCommand({
    meta: { name: "list", description: "登録済み Service Account プロジェクト一覧を表示する" },
    args: {
      ...commonArgs,
    },
    async run({ args }) {
      const a = args as CommonArgs
      checkSandbox("auth.sa.list", a)
      const logger = buildLogger(a)
      const startTime = Date.now()

      const configPath = getConfigPath()
      const config = loadConfig(configPath)
      const projects = Object.keys(config.serviceAccounts ?? {})

      if (a.json) {
        writeJson({ projects }, { command: "auth.sa.list", startTime }, buildJsonOpts(a))
      } else {
        if (projects.length === 0) {
          logger.info("登録済みの Service Account キーはありません")
        } else {
          for (const project of projects) {
            process.stdout.write(`${project}\n`)
          }
        }
      }
    },
  })
}

/**
 * createAuthSaCommand は auth sa コマンドグループ定義を返すファクトリ。
 * deps を省略した場合は本番実装を使用する。
 */
export function createAuthSaCommand(deps: AuthSaCommandDeps = {}) {
  return defineCommand({
    meta: { name: "sa", description: "Service Account キー管理コマンド" },
    subCommands: {
      add: createAuthSaAddCommand(deps),
      delete: createAuthSaDeleteCommand(deps),
      rm: createAuthSaDeleteCommand(deps),
      list: createAuthSaListCommand(deps),
      ls: createAuthSaListCommand(deps),
    },
    run: showUsageIfNoSubCommand,
  })
}

/** authSaCommand はデフォルト実装を使った auth sa コマンド定義。 */
export const authSaCommand = createAuthSaCommand()
