/**
 * sync/diff.ts — `cos sync diff [<title>]` コマンド。
 *
 * ローカルファイルと Cosense ページの差分を表示する。
 * --plain 時は GNU unified diff 風のテキスト出力。
 */

import {
  type CommonArgs,
  buildJsonOpts,
  buildRestClient,
  checkSandbox,
  commonArgs,
  requireProject,
} from "@/commands/_shared"
import { syncDiff } from "@/core/sync/engine"
import { FilenameInvalidError } from "@/core/sync/fsname"
import { loadConfig } from "@/infra/config"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const syncDiffCommand = defineCommand({
  meta: { name: "diff", description: "ローカルと Cosense の差分を表示する" },
  args: {
    ...commonArgs,
    title: {
      type: "positional",
      description: "ページタイトル (省略時は --all 必須)",
      required: false,
    },
    all: {
      type: "boolean",
      description: "プロジェクト全ページの差分を表示する",
      default: false,
    },
    dir: {
      type: "string",
      description: "同期ディレクトリ (未指定時は設定ファイルの sync.dir を使う)",
    },
  },
  async run({ args }) {
    const a = args as CommonArgs & {
      title?: string
      all: boolean
      dir?: string
    }

    checkSandbox("sync.diff", a)
    const project = requireProject(a)
    const startTime = Date.now()

    // --dir または設定ファイルの sync.dir を使う
    const config = loadConfig()
    const syncDir = a.dir ?? config.sync?.dir
    if (!syncDir) {
      writeErrorJson(
        "DIR_REQUIRED",
        "同期ディレクトリが指定されていません",
        "--dir フラグか `cos config set sync.dir <path>` で同期ディレクトリを指定してください",
      )
      process.exit(5)
    }

    // <title> も --all も未指定の場合はエラー
    if (!a.title && !a.all) {
      writeErrorJson(
        "TARGET_REQUIRED",
        "ページタイトルまたは --all を指定してください",
        "`cos sync diff <title>` または `cos sync diff --all` で対象を指定してください",
      )
      process.exit(5)
    }

    const client = await buildRestClient(a)

    if (a.title) {
      // 単一ページの diff
      try {
        const result = await syncDiff(client, syncDir, project, a.title)

        if (a.json || !a.plain) {
          writeJson(result, { command: "sync.diff", startTime }, buildJsonOpts(a))
        } else {
          writeDiffPlain(a.title, result.status, result.diff)
        }
      } catch (err) {
        if (err instanceof FilenameInvalidError) {
          writeErrorJson("FILENAME_INVALID", err.message, "タイトルに禁則文字が含まれています")
          process.exit(5)
        }
        throw err
      }
    } else {
      // --all: プロジェクト全ページの diff (ページネーションで全件取得)
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
          const result = await syncDiff(client, syncDir, project, summary.title)
          results.push(result)
        } catch (err) {
          if (err instanceof FilenameInvalidError) {
            warnings.push(`スキップ: "${summary.title}" — ${err.reason}`)
          } else {
            throw err
          }
        }
      }

      if (a.json || !a.plain) {
        writeJson(
          { total: results.length, results },
          { command: "sync.diff", startTime, warnings },
          buildJsonOpts(a),
        )
      } else {
        for (const r of results) {
          writeDiffPlain(r.title, r.status, r.diff)
        }
      }
    }
  },
})

/** writeDiffPlain は差分をプレーンテキスト (unified diff 風) で stdout に書き出す。 */
function writeDiffPlain(
  title: string,
  status: string,
  diff: {
    added: string[]
    removed: string[]
    modified: Array<{ line: number; before: string; after: string }>
  },
): void {
  if (status === "in-sync") {
    process.stdout.write(`${title}: 差分なし\n`)
    return
  }

  process.stdout.write(`--- a/${title}\n`)
  process.stdout.write(`+++ b/${title}\n`)

  for (const line of diff.removed) {
    process.stdout.write(`- ${line}\n`)
  }
  for (const m of diff.modified) {
    process.stdout.write(`- ${m.before}\n`)
    process.stdout.write(`+ ${m.after}\n`)
  }
  for (const line of diff.added) {
    process.stdout.write(`+ ${line}\n`)
  }

  if (status === "remote-only") {
    process.stdout.write("(リモートのみ: ローカルにファイルがありません)\n")
  } else if (status === "local-only") {
    process.stdout.write("(ローカルのみ: リモートにページがありません)\n")
  }
}
