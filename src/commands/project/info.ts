/**
 * project/info.ts — `cos project info [<name>]` コマンド。
 *
 * プロジェクトの詳細情報を取得して出力する。
 * プロジェクト名省略時は --project フラグのプロジェクトを使う。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { writeJson } from "@/presenter/json"
import { writePlainTable } from "@/presenter/plain"
import { defineCommand } from "citty"

export const projectInfoCommand = defineCommand({
  meta: { name: "info", description: "プロジェクト詳細情報を取得する" },
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
    checkSandbox("project.info", a)
    const logger = buildLogger(a)
    const project = a.name ?? requireProject(a)
    const startTime = Date.now()

    logger.info(`プロジェクト "${project}" の情報を取得中...`)

    const client = await buildRestClient(a)
    const info = await client.getProject(project)

    if (a.json || !a.plain) {
      writeJson(info, { command: "project.info", startTime }, buildJsonOpts(a))
      return
    }

    writePlainTable(
      ["フィールド", "値"],
      [
        ["名前", info.name],
        ["表示名", info.displayName],
        ["公開", String(info.publicVisible)],
        ["メンバー", String(info.isMember)],
      ],
    )
  },
})
