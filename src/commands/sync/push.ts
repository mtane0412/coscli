/**
 * sync/push.ts — `cos sync push [<title>]` コマンド。
 *
 * ローカルファイルの内容を Cosense ページに push する。
 * commitId の一致チェックで楽観ロック競合を検出する。
 */

import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildRestClient,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  requireProject,
} from "@/commands/_shared"
import { syncPush } from "@/core/sync/engine"
import { FilenameInvalidError } from "@/core/sync/fsname"
import { loadConfig } from "@/infra/config"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const syncPushCommand = defineCommand({
  meta: { name: "push", description: "ローカル → Cosense へ push する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
    title: {
      type: "positional",
      description: "ページタイトル (省略時は --all 必須)",
      required: false,
    },
    all: {
      type: "boolean",
      description: "ローカルにある全ファイルを一括 push する",
      default: false,
    },
    dir: {
      type: "string",
      description: "同期元ディレクトリ (未指定時は設定ファイルの sync.dir を使う)",
    },
    format: {
      type: "string",
      description: "ファイル形式 (txt のみ対応)",
      default: "txt",
    },
    retries: {
      type: "string",
      description: "楽観ロック競合時の最大リトライ回数 (デフォルト: 0)",
      default: "0",
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs & {
      title?: string
      all: boolean
      dir?: string
      format: string
      retries: string
    }

    checkSandbox("sync.push", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --dir または設定ファイルの sync.dir を使う
    const config = loadConfig()
    const syncDir = a.dir ?? config.sync?.dir
    if (!syncDir) {
      writeErrorJson(
        "DIR_REQUIRED",
        "同期元ディレクトリが指定されていません",
        "--dir フラグか `cos config set sync.dir <path>` で同期元ディレクトリを指定してください",
      )
      process.exit(5)
    }

    // <title> も --all も未指定の場合はエラー
    if (!a.title && !a.all) {
      writeErrorJson(
        "TARGET_REQUIRED",
        "ページタイトルまたは --all を指定してください",
        "`cos sync push <title>` または `cos sync push --all` で対象を指定してください",
      )
      process.exit(5)
    }

    const retries = Number.parseInt(a.retries, 10)
    const client = await buildRestClient(a)
    const writer = await buildWriter(a)
    const dryRun = a["dry-run"]

    if (a.title) {
      // 単一ページの push
      logger.info(`"${a.title}" を push 中...`)
      try {
        const result = await syncPush(client, writer, syncDir, project, a.title, {
          dryRun,
          retries,
        })

        if (result.errorCode === "META_REQUIRED") {
          writeErrorJson(
            "META_REQUIRED",
            `"${a.title}" のメタファイルが見つかりません`,
            "先に `cos sync pull` を実行して同期状態を初期化してください",
          )
          process.exit(5)
        }

        if (result.errorCode === "LOCAL_NOT_FOUND") {
          writeErrorJson(
            "LOCAL_NOT_FOUND",
            `ローカルファイル "${a.title}.txt" が見つかりません`,
            "ファイルが存在するか確認してください",
          )
          process.exit(5)
        }

        if (result.errorCode === "CONFLICT") {
          writeErrorJson(
            "CONFLICT",
            `"${a.title}" の楽観ロック競合が発生しました`,
            "cos sync pull で最新を取得してから再度 push してください",
            { localCommitId: result.localCommitId, serverCommitId: result.serverCommitId },
          )
          process.exit(6)
        }

        if (a.json || !a.plain) {
          writeJson(result, { command: "sync.push", startTime }, buildJsonOpts(a))
        } else {
          if (dryRun || result.dryRun) {
            process.stdout.write(`[dry-run] ${a.title}: push をシミュレートしました\n`)
          } else if (result.status === "in-sync") {
            process.stdout.write(`${a.title}: すでに同期済みです\n`)
          } else {
            process.stdout.write(
              `${a.title} を push しました (commitId: ${result.newCommitId ?? "unknown"})\n`,
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
      // --all: 同期ディレクトリのメタファイルから全ページを push
      logger.info(`${project} の全ページを push 中...`)

      const { readdirSync } = await import("node:fs")
      const { join } = await import("node:path")
      const metaDir = join(syncDir, ".coscli", project)

      // メタディレクトリが存在しない = 一度も pull していない
      const { existsSync } = await import("node:fs")
      if (!existsSync(metaDir)) {
        writeErrorJson(
          "NO_META_FOUND",
          `${project} のメタデータが見つかりません`,
          "先に `cos sync pull --all` を実行してください",
        )
        process.exit(5)
      }

      const metaFiles = readdirSync(metaDir).filter((f) => f.endsWith(".json"))
      const results = []
      const errors = []
      let conflictCount = 0

      for (const metaFile of metaFiles) {
        const title = metaFile.replace(/\.json$/, "")
        try {
          const result = await syncPush(client, writer, syncDir, project, title, {
            dryRun,
            retries,
          })
          results.push({ title, ...result })
          if (result.errorCode === "CONFLICT") {
            conflictCount++
            logger.warn(`  ✗ 競合: ${title}`)
          } else if (result.committed) {
            logger.verbose(`  ✓ push: ${title}`)
          } else {
            logger.verbose(`  - スキップ: ${title} (同期済み)`)
          }
        } catch (err) {
          errors.push({ title, error: err instanceof Error ? err.message : String(err) })
          logger.warn(`  ✗ エラー: ${title}`)
        }
      }

      if (a.json || !a.plain) {
        writeJson(
          {
            pushed: results.filter((r) => r.committed).length,
            conflicts: conflictCount,
            errors: errors.length,
            results,
            errorDetails: errors,
          },
          { command: "sync.push", startTime },
          buildJsonOpts(a),
        )
      } else {
        const pushed = results.filter((r) => r.committed).length
        process.stdout.write(`${pushed} ページを push しました`)
        if (conflictCount > 0) process.stdout.write(` (${conflictCount} 件の競合)`)
        if (errors.length > 0) process.stdout.write(` (${errors.length} 件のエラー)`)
        process.stdout.write("\n")
      }

      if (errors.length > 0 && conflictCount === 0) process.exit(1)
      if (conflictCount > 0) process.exit(6)
    }
  },
})
