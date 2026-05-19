/**
 * cli-runner.ts — citty コマンド実行ラッパー。
 *
 * --help / --version の手書き経路と、エラーキャッチ → exit コードマッピングを内包する。
 * cli.ts のエントリポイントから top-level await を分離し、テスト可能にする。
 */

import { ROOT_STRING_FLAGS, normalizeRootStringFlags } from "@/infra/args"
import {
  extractErrorMessage,
  extractStackTrace,
  resolveErrorCode,
  resolveExitCode,
} from "@/infra/cli-error-handler"
import { createCustomShowUsage } from "@/infra/help"
import { normalizeVersion } from "@/infra/version"
import { writeErrorJson } from "@/presenter/json"
import type { CommandDef } from "citty"
import { runCommand } from "citty"

/**
 * runWithHelpAndErrors は citty メインコマンドを実行する。
 * --help / --version の手書き経路と、エラーキャッチ → exit コードマッピングを内包する。
 */
export async function runWithHelpAndErrors(main: CommandDef, argv: string[]): Promise<void> {
  // citty がスペース区切りの string フラグ値をサブコマンドと誤認識する問題を回避する
  const rawArgs = normalizeRootStringFlags(argv, ROOT_STRING_FLAGS)
  const showUsageFn = createCustomShowUsage(main, "cos")

  // --help / -h: citty の showUsage を呼んで exit 0
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    await showUsageFn(main, null as never)
    process.exit(0)
    return
  }

  // --version (単独): バージョンを表示して exit 0
  if (rawArgs.length === 1 && rawArgs[0] === "--version") {
    const meta =
      typeof main.meta === "function" ? await main.meta() : await Promise.resolve(main.meta)
    const version = normalizeVersion(meta?.version ?? "")
    process.stdout.write(`${version}\n`)
    process.exit(0)
    return
  }

  // 通常コマンド実行: runCommand を直接呼び、エラーを自前で分類する
  const isJson = rawArgs.some((a) => a === "--json" || a === "-J")
  const isVerbose = rawArgs.some(
    (a) => a === "-v" || a === "-vv" || a === "--verbose" || a.startsWith("--verbose="),
  )

  try {
    await runCommand(main, { rawArgs })
  } catch (err) {
    const exitCode = resolveExitCode(err)
    const message = extractErrorMessage(err)
    const stack = isVerbose ? extractStackTrace(err) : undefined

    if (isJson) {
      writeErrorJson(resolveErrorCode(err), message)
    } else {
      const { Logger } = await import("@/infra/logger")
      const logger = new Logger()
      logger.error(message)
      if (stack) {
        process.stderr.write(`${stack}\n`)
      }
    }
    process.exit(exitCode)
  }
}
