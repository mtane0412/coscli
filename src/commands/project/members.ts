/**
 * project/members.ts — `cos project members [<name>]` コマンド。
 *
 * /api/projects/:project/users を叩いてプロジェクトメンバー一覧を取得する。
 * 現メンバー (users) と退去済みメンバー (memberSnapshots) を出力する。
 *
 * 終了コード:
 *   0   正常終了
 *   2   認証エラー
 *   3   権限エラー
 *   4   プロジェクト未発見
 *   5   バリデーションエラー
 *   7   sandbox 違反
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  handleRestError,
  requireProject,
} from "@/commands/_shared"
import { writeJson } from "@/presenter/json"
import { writePlainTable } from "@/presenter/plain"
import type { ProjectMembersResponse } from "@/schemas/project"
import { defineCommand } from "citty"

/** ProjectMembersRestClient は members コマンドが REST 呼び出しに使用する最小 interface。 */
export interface ProjectMembersRestClient {
  getProjectMembers(project: string): Promise<ProjectMembersResponse>
}

/**
 * ProjectMembersDeps は makeProjectMembersCommand に渡す依存オブジェクト。
 *
 * テスト時にモックを注入できるようにするための DI interface。
 * 指定しないフィールドは本番実装にフォールバックする。
 */
export interface ProjectMembersDeps {
  /** REST クライアント (省略時: buildRestClient で生成) */
  restClient?: ProjectMembersRestClient
}

/**
 * makeProjectMembersCommand は ProjectMembersDeps を受け取り、citty コマンドを返すファクトリ。
 *
 * deps を省略すると本番実装 (実際の REST API 呼び出し) を使用する。
 * テスト時は deps にモックを渡してフローを検証する。
 */
export function makeProjectMembersCommand(deps: ProjectMembersDeps = {}) {
  return defineCommand({
    meta: {
      name: "members",
      description: "プロジェクトメンバー一覧を取得する",
    },
    args: {
      ...commonArgs,
      name: {
        type: "positional",
        description: "プロジェクト名 (省略時は --project フラグを使用)",
        required: false,
      },
    },
    async run({ args }) {
      const a = args as CommonArgs & { name?: string }
      const startTime = Date.now()

      checkSandbox("project.members", a)

      const project = a.name ?? requireProject(a)

      const client: ProjectMembersRestClient =
        deps.restClient !== undefined ? deps.restClient : await buildRestClient(a)

      let result: ProjectMembersResponse
      try {
        result = await client.getProjectMembers(project)
      } catch (err) {
        handleRestError(err, { resourceKind: "project", resourceName: project })
        throw err
      }

      if (a.json || !a.plain) {
        writeJson(result, { command: "project.members", startTime }, buildJsonOpts(a))
        return
      }

      if (result.users.length === 0) {
        return
      }

      writePlainTable(
        ["ID", "ユーザー名", "表示名", "プロバイダ"],
        result.users.map((u) => [u.id, u.name, u.displayName, u.provider ?? ""]),
      )
    },
  })
}

/** projectMembersCommand は deps なしの本番実装コマンド。 */
export const projectMembersCommand = makeProjectMembersCommand()
