/**
 * sync/pull.ts — `cos sync pull [<title>]` コマンド。
 *
 * Cosense のページをローカルファイルとして取得する。
 * --all 指定でプロジェクト全ページを一括取得する。
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
import { syncPull } from "@/core/sync/engine"
import { FilenameInvalidError } from "@/core/sync/fsname"
import { loadConfig } from "@/infra/config"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const syncPullCommand = defineCommand({
  meta: { name: "pull", description: "Cosense → ローカルへ pull する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル (省略時は --all 必須)",
      required: false,
    },
    all: {
      type: "boolean",
      description: "プロジェクト全ページを一括取得する",
      default: false,
    },
    dir: {
      type: "string",
      description: "同期先ディレクトリ (未指定時は設定ファイルの sync.dir を使う)",
    },
    format: {
      type: "string",
      description: "ファイル形式 (txt のみ対応。md は v0.3 で対応予定)",
      default: "txt",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title?: string
      all: boolean
      dir?: string
      format: string
    }

    checkSandbox("sync.pull", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --format=md は v0.3 対応予定
    if (a.format !== "txt") {
      writeErrorJson(
        "FORMAT_NOT_SUPPORTED",
        `--format=${a.format} はサポートされていません`,
        "Markdown 変換は v0.3 で対応予定です。現在は --format=txt のみ使用できます",
      )
      process.exit(5)
    }

    // --dir または設定ファイルの sync.dir を使う
    const config = loadConfig()
    const syncDir = a.dir ?? config.sync?.dir
    if (!syncDir) {
      writeErrorJson(
        "DIR_REQUIRED",
        "同期先ディレクトリが指定されていません",
        "--dir フラグか `cos config set sync.dir <path>` で同期先ディレクトリを指定してください",
      )
      process.exit(5)
    }

    // <title> も --all も未指定の場合はエラー
    if (!a.title && !a.all) {
      writeErrorJson(
        "TARGET_REQUIRED",
        "ページタイトルまたは --all を指定してください",
        "`cos sync pull <title>` または `cos sync pull --all` で対象を指定してください",
      )
      process.exit(5)
    }

    const client = await buildRestClient(a)
    const dryRun = a["dry-run"]

    if (a.title) {
      // 単一ページの pull
      logger.info(`"${a.title}" を pull 中...`)
      try {
        const result = await syncPull(client, syncDir, project, a.title, { dryRun })
        if (a.json || !a.plain) {
          writeJson(result, { command: "sync.pull", startTime }, buildJsonOpts(a))
        } else {
          if (dryRun) {
            process.stdout.write(`[dry-run] ${result.title}: ${result.lines.length} 行\n`)
          } else {
            process.stdout.write(
              `${result.title} を pull しました (commitId: ${result.commitId})\n`,
            )
          }
        }
      } catch (err) {
        if (err instanceof FilenameInvalidError) {
          writeErrorJson("FILENAME_INVALID", err.message, "タイトルに禁則文字が含まれています")
          process.exit(5)
        }
        throw err
      }
    } else {
      // --all: プロジェクト全ページを一括 pull (ページネーションで全件取得)
      logger.info(`${project} の全ページを pull 中...`)
      const allPages = []
      let skip = 0
      const pageLimit = 100
      while (true) {
        const pageList = await client.listPages(project, { limit: pageLimit, skip })
        allPages.push(...pageList.pages)
        if (pageList.pages.length === 0) break
        if (allPages.length >= pageList.count) break
        skip += pageLimit
      }
      const results = []
      const warnings: string[] = []

      for (const summary of allPages) {
        try {
          const result = await syncPull(client, syncDir, project, summary.title, { dryRun })
          results.push(result)
          logger.verbose(`  ✓ ${summary.title}`)
        } catch (err) {
          if (err instanceof FilenameInvalidError) {
            warnings.push(`スキップ: "${summary.title}" — ${err.reason}`)
            logger.warn(`  ✗ ${summary.title}: ${err.reason}`)
          } else {
            throw err
          }
        }
      }

      if (a.json || !a.plain) {
        writeJson(
          { pulled: results.length, skipped: warnings.length, results },
          { command: "sync.pull", startTime, warnings },
          buildJsonOpts(a),
        )
      } else {
        process.stdout.write(`${results.length} ページを pull しました`)
        if (warnings.length > 0) {
          process.stdout.write(` (${warnings.length} ページをスキップ)\n`)
          for (const w of warnings) process.stdout.write(`  ${w}\n`)
        } else {
          process.stdout.write("\n")
        }
      }
    }
  },
})
