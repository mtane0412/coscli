/**
 * page/pin.ts — `cos page pin <title>` コマンド。
 *
 * ページをピン留めする。WebSocket commit で PinChange を送信する。
 * --create 未指定時は事前に存在確認を行い、404 の場合は NOT_FOUND (exit 4) で終了する。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  buildWriter,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { pinPage } from "@/core/pages"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pagePinCommand = defineCommand({
  meta: { name: "pin", description: "ページをピン留めする" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    create: {
      type: "boolean",
      description: "ページが未作成の場合に空ページを作成してピン留めする",
      default: false,
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & { title: string; create: boolean }
    checkSandbox("page.pin", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --create 未指定時は対象ページの存在確認
    if (!a.create && !a["dry-run"]) {
      const client = await buildRestClient(a)
      try {
        await client.getPage(project, a.title)
      } catch (err) {
        const isNotFound = err instanceof Error && err.constructor.name === "NotFoundError"
        if (isNotFound) {
          writeErrorJson(
            "NOT_FOUND",
            `ページ "${a.title}" が見つかりません`,
            "ページを作成してからピン留めするか、--create フラグを使用してください",
          )
          process.exit(4)
        }
        throw err
      }
    }

    logger.info(`"${a.title}" をピン留め中...`)

    const writer = await buildWriter(a)
    const result = await pinPage(writer, { project, title: a.title, create: a.create })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.pin", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" をピン留めしました`)
  },
})
