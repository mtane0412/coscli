/**
 * page/snapshot/list.ts — `cos page snapshot list <title>` コマンド。
 *
 * ページのスナップショット一覧 (GET /api/page-snapshots/:project/:pageid) を取得して出力する。
 * まず getPage でタイトルから pageId を解決し、getPageSnapshotList でスナップショット一覧を取得する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  exitWithError,
  handleRestError,
  requireProject,
} from "@/commands/_shared"
import { getPage, getPageSnapshotList } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** pageSnapshotListCommand はページのスナップショット一覧を取得するコマンドを返す。 */
export const pageSnapshotListCommand = defineCommand({
  meta: { name: "list", description: "ページのスナップショット一覧を取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string }
    checkSandbox("page.snapshot.list", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // title の空文字チェック (positional は required でも空文字が来うる)
    if (!a.title) {
      writeErrorJson(
        "VALIDATION_ERROR",
        "title が指定されていません",
        "ページタイトルを指定してください",
      )
      exitWithError(5, "VALIDATION_ERROR")
    }

    try {
      const client = await buildRestClient(a)

      // title → pageId 解決
      const page = await getPage(client, { project, title: a.title })

      // スナップショット一覧取得
      const snapshotList = await getPageSnapshotList(client, { project, pageId: page.id })

      if (a.json || !a.plain) {
        writeJson(
          { pageId: snapshotList.pageId, timestamps: snapshotList.timestamps },
          { command: "page.snapshot.list", startTime },
          buildJsonOpts(a),
        )
        return
      }

      // plain 出力: 1 スナップショット 1 行 (<timestampId>  <YYYY-MM-DD HH:MM:SS>)
      for (const ts of snapshotList.timestamps) {
        const date = new Date(ts.created * 1000).toISOString().replace("T", " ").slice(0, 19)
        process.stdout.write(`${ts.id}  ${date}\n`)
      }
    } catch (err) {
      handleRestError(err, { resourceKind: "page", resourceName: a.title })
      throw err
    }
  },
})
