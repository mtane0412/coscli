/**
 * auth/migrate.ts — `cos auth migrate` コマンド。
 *
 * config.serviceAccounts に保存された SA Key を keychain (CredentialStore) に移行する。
 * 旧 `cos auth sa add` で登録した SA Key を新しいプロファイルベースの管理に移行する。
 *
 * 動作:
 * - 各エントリを cs_<project> という名前のプロファイルで keychain に保存する
 * - プロファイルが既に存在する場合はスキップして警告を出す
 * - --dry-run で変更計画のみ表示する (実際の変更は行わない)
 * - 移行成功分だけ config から serviceAccounts エントリを削除する
 * - --set-default <profile> で config.defaultProfile を同時に設定する
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import type { CredentialStore } from "@/core/auth/credential-store"
import { TokenStoreCredentialAdapter } from "@/core/auth/credential-store"
import {
  defaultConfigPath,
  loadLegacyServiceAccounts,
  removeLegacyServiceAccounts,
} from "@/infra/config"
import { createTokenStore } from "@/infra/keychain/index"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** AuthMigrateCommandDeps は createAuthMigrateCommand に注入できる依存。テスト専用。 */
export interface AuthMigrateCommandDeps {
  /** configPath は設定ファイルパスの上書き。未指定時はデフォルトパスを使用する。 */
  configPath?: string
  /** createCredStore は CredentialStore を生成する関数。未指定時は OS keychain を使用する。 */
  createCredStore?: () => CredentialStore
}

/** createAuthMigrateCommand は依存を注入して migrate コマンドを生成する。 */
export function createAuthMigrateCommand(deps: AuthMigrateCommandDeps = {}) {
  const getConfigPath = () => deps.configPath ?? defaultConfigPath()
  const getCredStore = () =>
    deps.createCredStore
      ? deps.createCredStore()
      : new TokenStoreCredentialAdapter(createTokenStore())

  return defineCommand({
    meta: {
      name: "migrate",
      description: "config.serviceAccounts に保存された SA キーを keychain に移行する",
    },
    args: {
      ...commonArgs,
      "dry-run": {
        type: "boolean",
        description: "変更計画のみ表示して実際の変更は行わない",
        default: false,
      },
      "set-default": {
        type: "string",
        description: "移行後に config.defaultProfile を指定プロファイルに設定する",
      },
    },
    async run({ args }) {
      type MigrateArgs = CommonArgs & {
        "dry-run": boolean
        "set-default"?: string
      }
      const a = args as MigrateArgs
      checkSandbox("auth.migrate", a)
      const logger = buildLogger(a)
      const startTime = Date.now()
      const isDryRun = a["dry-run"]

      const configPath = getConfigPath()
      const serviceAccounts = loadLegacyServiceAccounts(configPath)
      const projects = Object.keys(serviceAccounts)

      if (projects.length === 0) {
        logger.info("移行対象の Service Account キーはありません")
        if (a.json) {
          writeJson(
            { migrated: [], skipped: [] },
            { command: "auth.migrate", startTime },
            buildJsonOpts(a),
          )
        }
        return
      }

      const credStore = getCredStore()
      const migrated: string[] = []
      const skipped: string[] = []

      for (const project of projects) {
        const saKey = serviceAccounts[project]
        // projects は serviceAccounts のキー一覧なので saKey は必ず存在する
        if (saKey === undefined) continue
        const profileName = `cs_${project}`

        // 既存プロファイルとの衝突チェック
        const existing = await credStore.load(profileName)
        if (existing !== null) {
          process.stderr.write(
            `警告: プロファイル "${profileName}" は既に keychain に存在します。${project} をスキップします。\n`,
          )
          skipped.push(project)
          continue
        }

        if (isDryRun) {
          logger.info(`[dry-run] "${project}" → プロファイル "${profileName}" に保存予定`)
          migrated.push(project)
          continue
        }

        // keychain に SA Credential を保存する
        await credStore.save(profileName, {
          kind: "sa",
          value: saKey,
          defaultProject: project,
        })
        logger.success(`"${project}" → プロファイル "${profileName}" に移行しました`)
        migrated.push(project)
      }

      // 移行成功分を config から削除する (dry-run では削除しない)
      if (!isDryRun) {
        if (migrated.length > 0 || a["set-default"] !== undefined) {
          removeLegacyServiceAccounts(migrated, configPath, a["set-default"])
        }
      }

      if (a.json) {
        writeJson(
          { migrated, skipped, dryRun: isDryRun },
          { command: "auth.migrate", startTime },
          buildJsonOpts(a),
        )
      }
    },
  })
}

/** authMigrateCommand はデフォルト実装を使った auth migrate コマンド定義。 */
export const authMigrateCommand = createAuthMigrateCommand()
