/**
 * auth/doctor.ts — `cos auth doctor` コマンド。
 *
 * 全プロファイルに対してフォーマット検証と API 疎通確認を行い、問題があれば修復方法を提示する。
 * exit code: 1 件でも fail があれば exit 1。
 *
 * デフォルトで /api/users/me に疎通確認を行う。
 * --offline を指定した場合はフォーマット検証のみ実行する。
 */

import { type CommonArgs, buildJsonOpts, checkSandbox, commonArgs } from "@/commands/_shared"
import { AuthError, CosenseRestClient } from "@/core/api/rest"
import { type Credential, displayKind } from "@/core/auth/credential"
import type { CredentialStore } from "@/core/auth/credential-store"
import { TokenStoreCredentialAdapter } from "@/core/auth/credential-store"
import { createTokenStore } from "@/infra/keychain/index"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"
import { ZodError } from "zod"

/** DoctorResult は doctor コマンドがプロファイルごとに生成する検査結果。 */
interface DoctorResult {
  profile: string
  kind: string
  status: "ok" | "warn"
  message?: string
}

/** DoctorApiClient は API 疎通確認に使用するクライアントの最小インターフェース。 */
interface DoctorApiClient {
  getMe(): Promise<unknown>
}

/** AuthDoctorCommandDeps は createAuthDoctorCommand に注入できる依存。テスト専用。 */
export interface AuthDoctorCommandDeps {
  /** createCredStore は CredentialStore を生成する関数。未指定時は OS keychain を使用する。 */
  createCredStore?: () => CredentialStore
  /** createClient は API 疎通確認用クライアントを生成する関数。未指定時は CosenseRestClient を使用する。 */
  createClient?: (cred: Credential) => DoctorApiClient
}

function defaultCreateClient(cred: Credential): DoctorApiClient {
  switch (cred.kind) {
    case "pat":
      return new CosenseRestClient({ personalAccessToken: cred.value })
    case "sa":
      return new CosenseRestClient({ serviceAccountKey: cred.value })
    case "sid":
      return new CosenseRestClient({ sid: cred.value })
    default: {
      const _exhaustive: never = cred
      throw new Error("未対応の Credential kind です")
    }
  }
}

/** createAuthDoctorCommand は依存を注入して doctor コマンドを生成する。 */
export function createAuthDoctorCommand(deps: AuthDoctorCommandDeps = {}) {
  const getCredStore = () =>
    deps.createCredStore
      ? deps.createCredStore()
      : new TokenStoreCredentialAdapter(createTokenStore())
  const getClient = deps.createClient ?? defaultCreateClient

  return defineCommand({
    meta: { name: "doctor", description: "全プロファイルの健全性を検査する" },
    args: {
      ...commonArgs,
      offline: {
        type: "boolean" as const,
        description: "API 疎通確認をスキップする（オフライン環境向け）",
        default: false,
      },
    },
    async run({ args }) {
      const a = args as CommonArgs & { offline: boolean }
      checkSandbox("auth.doctor", a)
      const startTime = Date.now()

      const credStore = getCredStore()
      const entries = await credStore.list()
      const results: DoctorResult[] = []

      for (const entry of entries) {
        const cred = await credStore.load(entry.profile)
        if (cred === null) {
          results.push({
            profile: entry.profile,
            kind: entry.kind,
            status: "warn",
            message: "プロファイルが keychain から読み取れませんでした",
          })
          continue
        }

        // SA Credential は defaultProject 必須
        if (cred.kind === "sa" && !cred.defaultProject) {
          results.push({
            profile: entry.profile,
            kind: entry.kind,
            status: "warn",
            message:
              "SA Credential に defaultProject が設定されていません。`cos auth migrate` で再移行するか、プロファイルを削除して再登録してください",
          })
          continue
        }

        // --offline が指定された場合は API 疎通確認をスキップする
        if (a.offline) {
          results.push({
            profile: entry.profile,
            kind: displayKind(cred),
            status: "ok",
          })
          continue
        }

        // API 疎通確認: /api/users/me を呼び出して認証の有効性を確認する
        try {
          const client = getClient(cred)
          await client.getMe()
          results.push({
            profile: entry.profile,
            kind: displayKind(cred),
            status: "ok",
          })
        } catch (err) {
          if (err instanceof AuthError || err instanceof ZodError) {
            // ZodError: Cosense は無効なセッションで 401 でなく 200 + ゲストレスポンスを返すことがある
            // その場合 MeSchema のパースが失敗するため、セッション無効として扱う
            results.push({
              profile: entry.profile,
              kind: displayKind(cred),
              status: "warn",
              message: `セッションが無効です。\`cos auth login --profile ${entry.profile}\` で再ログインしてください`,
            })
          } else {
            results.push({
              profile: entry.profile,
              kind: displayKind(cred),
              status: "warn",
              message: `API 疎通確認に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
            })
          }
        }
      }

      const hasWarn = results.some((r) => r.status === "warn")

      if (a.json) {
        writeJson({ profiles: results }, { command: "auth.doctor", startTime }, buildJsonOpts(a))
        if (hasWarn) process.exit(1)
        return
      }

      if (entries.length === 0) {
        process.stdout.write("登録済みのプロファイルはありません\n")
        return
      }

      for (const r of results) {
        const icon = r.status === "ok" ? "✓" : "✗"
        process.stdout.write(`${icon} ${r.profile} (${r.kind})\n`)
        if (r.message) {
          process.stdout.write(`  → ${r.message}\n`)
        }
      }

      if (hasWarn) process.exit(1)
    },
  })
}

/** authDoctorCommand は OS keychain を使うデフォルト実装。 */
export const authDoctorCommand = createAuthDoctorCommand()
