/**
 * auth/add.ts — `cos auth add` コマンド。
 *
 * API 検証なしで認証情報を直接キーチェーンに保存する。CI/エージェント向けの
 * non-interactive コマンドのみを対象とし、対話入力は提供しない。
 *
 * 使用例:
 *   cos auth add --type sid --key <raw> [--profile <name>] [--set-default]
 *   cos auth add --type pat --key-env MY_PAT_ENV [--profile <name>]
 *   cos auth add --type sa --key-stdin --project <name> [--profile <name>]
 *
 * 入力モード (排他):
 *   --key <raw>       : 値を直接渡す
 *   --key-env <ENV>   : 環境変数名を受け取り process.env[ENV] から値を読む
 *   --key-stdin       : stdin から値を読む (末尾改行を trim)
 *
 * バリデーション:
 *   --type sa + --project 未指定 → exit 5 + VALIDATION_ERROR
 *   --key-env <ENV> + env 未設定  → exit 5 + VALIDATION_ERROR
 *   複数の入力モード同時指定       → exit 5 + VALIDATION_ERROR
 *   入力モードなし                 → exit 5 + VALIDATION_ERROR
 *   フォーマット不正               → exit 5 + INVALID_SID / INVALID_PERSONAL_ACCESS_TOKEN / INVALID_SERVICE_ACCOUNT_KEY
 */

import {
  type CommonArgs,
  PersonalAccessTokenValidationError,
  ServiceAccountKeyValidationError,
  SidValidationError,
  assertValidPersonalAccessToken,
  assertValidServiceAccountKey,
  assertValidSid,
  buildJsonOpts,
  buildLogger,
  checkSandbox,
  commonArgs,
  exitWithError,
} from "@/commands/_shared"
import type { Credential } from "@/core/auth/credential"
import type { CredentialStore } from "@/core/auth/credential-store"
import { TokenStoreCredentialAdapter } from "@/core/auth/credential-store"
import { defaultConfigPath, loadConfig, saveConfig } from "@/infra/config"
import { createTokenStore } from "@/infra/keychain/index"
import { readStdinBounded } from "@/infra/safe-read"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** AuthAddCommandDeps は createAuthAddCommand に注入できる依存。テスト専用。 */
export interface AuthAddCommandDeps {
  /** configPath は設定ファイルパスの上書き。未指定時はデフォルトパスを使用する。 */
  configPath?: string
  /** createCredStore は CredentialStore を生成する関数。未指定時は OS keychain を使用する。 */
  createCredStore?: () => CredentialStore
}

/** createAuthAddCommand は依存を注入して add コマンドを生成する。 */
export function createAuthAddCommand(deps: AuthAddCommandDeps = {}) {
  const getConfigPath = () => deps.configPath ?? defaultConfigPath()
  const getCredStore = () =>
    deps.createCredStore
      ? deps.createCredStore()
      : new TokenStoreCredentialAdapter(createTokenStore())

  return defineCommand({
    meta: {
      name: "add",
      description: "認証情報を直接キーチェーンに保存する (non-interactive)",
    },
    args: {
      ...commonArgs,
      type: {
        type: "string" as const,
        description: "認証方式 (sid / pat / sa)",
      },
      key: {
        type: "string" as const,
        description: "認証キーの値を直接指定する",
      },
      "key-env": {
        type: "string" as const,
        description: "認証キーを読み取る環境変数名 (CI フレンドリーパターン)",
      },
      "key-stdin": {
        type: "boolean" as const,
        description: "stdin から認証キーを読み取る",
        default: false,
      },
      "set-default": {
        type: "boolean" as const,
        description: "保存後に config.defaultProfile を更新する",
        default: false,
      },
    },
    async run({ args }) {
      type AddArgs = CommonArgs & {
        type?: string
        key?: string
        "key-env"?: string
        "key-stdin": boolean
        "set-default": boolean
      }
      const a = args as AddArgs
      checkSandbox("auth.add", a)
      const logger = buildLogger(a)
      const startTime = Date.now()

      // --type のバリデーション
      const credType = a.type
      if (credType !== "sid" && credType !== "pat" && credType !== "sa") {
        writeErrorJson(
          "VALIDATION_ERROR",
          "--type は sid / pat / sa のいずれかを指定してください",
          "--type sid, --type pat, または --type sa を指定してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }

      // 入力モードの排他チェック (複数同時指定は禁止)
      const inputModeCount = [
        a.key !== undefined,
        a["key-env"] !== undefined,
        a["key-stdin"],
      ].filter(Boolean).length
      if (inputModeCount > 1) {
        writeErrorJson(
          "VALIDATION_ERROR",
          "--key / --key-env / --key-stdin は同時に指定できません",
          "いずれか 1 つの入力モードを選択してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }

      // 入力モードなし (non-interactive のみ対応)
      if (inputModeCount === 0) {
        writeErrorJson(
          "VALIDATION_ERROR",
          "認証キーの入力方法を指定してください",
          "--key <value>, --key-env <ENV_NAME>, または --key-stdin を使用してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }

      // --type sa + --project 未指定チェック
      if (credType === "sa" && !a.project) {
        writeErrorJson(
          "VALIDATION_ERROR",
          "--type sa の場合は --project が必須です",
          "--project フラグでプロジェクト名を指定してください",
        )
        exitWithError(5, "VALIDATION_ERROR")
      }

      // 値の取得
      let rawValue: string
      if (a.key !== undefined) {
        // --key <raw>
        rawValue = a.key
      } else if (a["key-env"] !== undefined) {
        // --key-env <ENV>: 環境変数名からキー値を読む
        const envVarName = a["key-env"]
        const envValue = process.env[envVarName]
        if (envValue === undefined) {
          writeErrorJson(
            "VALIDATION_ERROR",
            `環境変数 ${envVarName} が設定されていません`,
            `export ${envVarName}=<value> で環境変数を設定してから再実行してください`,
          )
          exitWithError(5, "VALIDATION_ERROR")
        }
        rawValue = envValue
      } else {
        // --key-stdin: stdin から読み取り、末尾改行を trim する
        rawValue = readStdinBounded().trimEnd()
      }

      // フォーマット検証と Credential の構築
      const profile = a.profile ?? "default"
      let cred: Credential

      if (credType === "sid") {
        try {
          assertValidSid(rawValue)
        } catch (err) {
          if (err instanceof SidValidationError) {
            writeErrorJson(
              "INVALID_SID",
              err.message,
              "改行・制御文字・空白を含まない印字可能 ASCII 文字列を指定してください",
            )
            exitWithError(5, "INVALID_SID")
          }
          throw err
        }
        cred = { kind: "sid", value: rawValue }
      } else if (credType === "pat") {
        try {
          assertValidPersonalAccessToken(rawValue)
        } catch (err) {
          if (err instanceof PersonalAccessTokenValidationError) {
            writeErrorJson(
              "INVALID_PERSONAL_ACCESS_TOKEN",
              err.message,
              "pat_ で始まる 68 文字の Personal Access Token を指定してください",
            )
            exitWithError(5, "INVALID_PERSONAL_ACCESS_TOKEN")
          }
          throw err
        }
        cred = { kind: "pat", value: rawValue }
      } else {
        // credType === "sa" (--project 必須チェック済み)
        try {
          assertValidServiceAccountKey(rawValue)
        } catch (err) {
          if (err instanceof ServiceAccountKeyValidationError) {
            writeErrorJson(
              "INVALID_SERVICE_ACCOUNT_KEY",
              err.message,
              "cs_ で始まる 67 文字の Service Account Key を指定してください",
            )
            exitWithError(5, "INVALID_SERVICE_ACCOUNT_KEY")
          }
          throw err
        }
        // a.project の存在は上記でチェック済みなので non-null assertion は安全
        cred = { kind: "sa", value: rawValue, defaultProject: a.project as string }
      }

      // キーチェーンに保存
      const credStore = getCredStore()
      await credStore.save(profile, cred)

      // --set-default: config.defaultProfile を更新する
      if (a["set-default"]) {
        const configPath = getConfigPath()
        saveConfig({ ...loadConfig(configPath), defaultProfile: profile }, configPath)
      }

      logger.success(`認証情報を保存しました (プロファイル: ${profile}, 種別: ${credType})`)

      if (a.json) {
        writeJson({ profile, type: credType }, { command: "auth.add", startTime }, buildJsonOpts(a))
      }
    },
  })
}

/** authAddCommand は OS keychain を使うデフォルト実装。 */
export const authAddCommand = createAuthAddCommand()
