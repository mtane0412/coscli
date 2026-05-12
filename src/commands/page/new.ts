/**
 * page/new.ts — `cos page new <title>` コマンド。
 *
 * 新しいページを作成する。
 * --from-file でファイルから、- で stdin から本文を読み込む。
 */

import {
  type WriteCommonArgs,
  buildJsonOpts,
  buildLogger,
  buildWriter,
  checkSandbox,
  commonArgs,
  dryRunArg,
  isStdinPath,
  requireProject,
  unsafeReadArg,
} from "@/commands/_shared"
import { createPage } from "@/core/pages"
import { UnsafePathError, readFromFile, readStdinBounded } from "@/infra/safe-read"
import { writeErrorJson, writeJson } from "@/presenter/json"
import { defineCommand } from "citty"

export const pageNewCommand = defineCommand({
  meta: { name: "new", description: "新しいページを作成する" },
  args: {
    ...commonArgs,
    ...dryRunArg,
    ...unsafeReadArg,
    title: {
      type: "positional",
      description: "ページタイトル",
      required: true,
    },
    "from-file": {
      type: "string",
      description: "本文ファイルパス (- で stdin)",
    },
    line: {
      type: "string",
      description:
        "追加する行テキスト。複数行は \\n で区切るか、--line を複数回指定する (例: --line 行1 --line 行2)",
    },
  },
  async run({ args }) {
    const a = args as WriteCommonArgs & {
      title: string
      "from-file"?: string
      "allow-unsafe-read": boolean
      /** citty が --line を複数回受け取ると string[] になる */
      line?: string | string[]
    }
    checkSandbox("page.new", a)
    const logger = buildLogger(a)
    const project = requireProject(a)
    const startTime = Date.now()

    let lines: string[] = []
    if (isStdinPath(a["from-file"])) {
      // stdin から読み込む (citty が "-" を "" に変換するバグにも対応)
      try {
        const content = readStdinBounded()
        lines = content.split("\n").filter((l) => l.length > 0 || content.endsWith("\n"))
      } catch (err) {
        if (err instanceof UnsafePathError) {
          writeErrorJson("UNSAFE_PATH", err.message)
          process.exit(5)
        }
        throw err
      }
    } else if (a["from-file"]) {
      try {
        const content = readFromFile(a["from-file"], { allowUnsafe: a["allow-unsafe-read"] })
        lines = content.split("\n")
      } catch (err) {
        if (err instanceof UnsafePathError) {
          writeErrorJson("UNSAFE_PATH", err.message, "--allow-unsafe-read フラグで許可できます")
          process.exit(5)
        }
        throw err
      }
    } else if (a.line !== undefined) {
      // citty は --line を複数回渡すと配列になるため、string と string[] の両方に対応する
      // 実改行（\n, \r\n）とエスケープシーケンス（\\n）の両方を展開する
      const lineValues = Array.isArray(a.line) ? a.line : [a.line]
      lines = lineValues.flatMap((l) => l.split(/\r?\n|\\n/))
    }

    if (lines.length === 0) {
      writeErrorJson(
        "CONTENT_REQUIRED",
        "ページ本文が指定されていません",
        "--from-file または --line でコンテンツを指定してください",
      )
      process.exit(5)
    }

    logger.info(`"${a.title}" を作成中...`)

    const writer = await buildWriter(a)
    const result = await createPage(writer, { project, title: a.title, lines })

    if (a.json || a["dry-run"]) {
      writeJson(result, { command: "page.new", startTime }, buildJsonOpts(a))
      return
    }

    logger.success(`ページ "${a.title}" を作成しました`)
  },
})
