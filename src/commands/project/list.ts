/**
 * project/list.ts — `cos project list` コマンド。
 *
 * 参加中のプロジェクト一覧を取得して出力する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  checkSandbox,
  commonArgs,
} from "@/commands/_shared"
import { writeJson } from "@/presenter/json"
import { writePlainTable, writeTsv } from "@/presenter/plain"
import { defineCommand } from "citty"

export const projectListCommand = defineCommand({
  meta: { description: "参加中のプロジェクト一覧を取得する" },
  args: { ...commonArgs },
  async run({ args }) {
    const a = args as CommonArgs
    checkSandbox("project.list", a)
    const logger = buildLogger(a)
    const startTime = Date.now()

    logger.info("プロジェクト一覧を取得中...")

    const client = await buildRestClient(a)
    const result = await client.listProjects()

    if (a.json) {
      writeJson(result, { command: "project.list", startTime }, buildJsonOpts(a))
      return
    }

    if (a.plain) {
      writeTsv(
        ["name", "displayName", "publicVisible"],
        result.projects.map((p) => [p.name, p.displayName, String(p.publicVisible)]),
      )
      return
    }

    writePlainTable(
      ["名前", "表示名", "公開"],
      result.projects.map((p) => [p.name, p.displayName, p.publicVisible ? "✓" : "✗"]),
    )
  },
})
