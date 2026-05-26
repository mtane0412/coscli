/**
 * auth/doctor.ts — `cos auth doctor` コマンド。
 *
 * 全プロファイルに対してフォーマット検証を行い、問題があれば修復方法を提示する。
 * exit code: 1 件でも fail があれば exit 1。
 */

import { type CommonArgs, buildJsonOpts, checkSandbox, commonArgs } from "@/commands/_shared"
import { displayKind } from "@/core/auth/credential"
import type { CredentialStore } from "@/core/auth/credential-store"
import { TokenStoreCredentialAdapter } from "@/core/auth/credential-store"
import { createTokenStore } from "@/infra/keychain/index"
import { writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** DoctorResult は doctor コマンドがプロファイルごとに生成する検査結果。 */
interface DoctorResult {
  profile: string
  kind: string
  status: "ok" | "warn"
  message?: string
}

/** AuthDoctorCommandDeps は createAuthDoctorCommand に注入できる依存。テスト専用。 */
export interface AuthDoctorCommandDeps {
  /** createCredStore は CredentialStore を生成する関数。未指定時は OS keychain を使用する。 */
  createCredStore?: () => CredentialStore
}

/** createAuthDoctorCommand は依存を注入して doctor コマンドを生成する。 */
export function createAuthDoctorCommand(deps: AuthDoctorCommandDeps = {}) {
  const getCredStore = () =>
    deps.createCredStore
      ? deps.createCredStore()
      : new TokenStoreCredentialAdapter(createTokenStore())

  return defineCommand({
    meta: { name: "doctor", description: "全プロファイルの健全性を検査する" },
    args: { ...commonArgs },
    async run({ args }) {
      const a = args as CommonArgs
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

        results.push({
          profile: entry.profile,
          kind: displayKind(cred),
          status: "ok",
        })
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
