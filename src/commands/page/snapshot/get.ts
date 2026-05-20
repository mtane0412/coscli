/**
 * page/snapshot/get.ts — `cos page snapshot get <title> <timestampId>` コマンド。
 *
 * 特定スナップショット (GET /api/page-snapshots/:project/:pageid/:timestampid) を取得して出力する。
 * まず getPage でタイトルから pageId を解決し、getPageSnapshot でスナップショットを取得する。
 *
 * 出力モード:
 * - デフォルト / --json: { page, snapshot } の JSON envelope
 * - --plain: 人間向け meta + 本文テキスト
 * - --text: snapshot.lines[].text のみを改行区切りで出力 (cos page text 相当)
 * --text と --plain は排他。同時指定は VALIDATION_ERROR (exit 5)。
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
import { getPage, getPageSnapshot } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

/** pageSnapshotGetCommand はページの特定スナップショットを取得するコマンドを返す。 */
export const pageSnapshotGetCommand = defineCommand({
  meta: { name: "get", description: "ページの特定スナップショットを取得する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    timestampId: {
      type: "positional",
      description: "スナップショットの timestamp ID",
      required: true,
    },
    text: {
      type: "boolean",
      default: false,
      description: "スナップショット本文のみをテキスト出力する (--plain と排他)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; timestampId: string; text: boolean }
    checkSandbox("page.snapshot.get", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // title の空文字チェック
    if (!a.title) {
      writeErrorJson(
        "VALIDATION_ERROR",
        "title が指定されていません",
        "ページタイトルを指定してください",
      )
      process.exit(5)
      throw new Error("VALIDATION_ERROR")
    }

    // timestampId の空文字チェック
    if (!a.timestampId) {
      writeErrorJson(
        "VALIDATION_ERROR",
        "timestampId が指定されていません",
        "スナップショットの timestamp ID を指定してください",
      )
      process.exit(5)
      throw new Error("VALIDATION_ERROR")
    }

    // --text と --plain の排他チェック
    if (a.text && a.plain) {
      writeErrorJson(
        "VALIDATION_ERROR",
        "--text と --plain を同時に指定することはできません",
        "--text か --plain のどちらか一方を指定してください",
      )
      process.exit(5)
      throw new Error("VALIDATION_ERROR")
    }

    try {
      const client = await buildRestClient(a)

      // title → pageId 解決
      const page = await getPage(client, { project, title: a.title })

      // スナップショット取得
      const result = await getPageSnapshot(client, {
        project,
        pageId: page.id,
        timestampId: a.timestampId,
      })

      // --text: 本文のみをテキスト出力
      if (a.text) {
        for (const line of result.snapshot.lines) {
          process.stdout.write(`${line.text}\n`)
        }
        return
      }

      // --plain: 人間向けメタ + 本文
      if (a.plain) {
        const date = new Date(result.snapshot.created * 1000)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19)
        process.stdout.write(`# ${result.snapshot.title}\n`)
        process.stdout.write(`created: ${date}\n`)
        process.stdout.write("\n")
        for (const line of result.snapshot.lines) {
          process.stdout.write(`${line.text}\n`)
        }
        return
      }

      // デフォルト / --json: JSON envelope 出力
      writeJson(
        { page: result.page, snapshot: result.snapshot },
        { command: "page.snapshot.get", startTime },
        buildJsonOpts(a),
      )
    } catch (err) {
      handleRestError(err, { resourceKind: "snapshot", resourceName: a.title })
      throw err
    }
  },
})
