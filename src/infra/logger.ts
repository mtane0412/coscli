/**
 * logger.ts — stderr への人間向けメッセージ出力。
 *
 * データは stdout、進捗・警告・ヒントは stderr に書く。
 * --json / --plain / --quiet 時は人間向けメッセージを抑制する。
 */

import { color } from "@/infra/color"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LoggerOptions {
  quiet?: boolean
  json?: boolean
  plain?: boolean
  verbose?: number
}

/** Logger は stderr への人間向けメッセージ出力を管理する。 */
export class Logger {
  constructor(private readonly opts: LoggerOptions = {}) {}

  /** info は通常の進捗メッセージを stderr に出力する。 */
  info(message: string): void {
    if (this.isSilent()) return
    process.stderr.write(`${message}\n`)
  }

  /** success は成功メッセージを stderr に出力する。 */
  success(message: string): void {
    if (this.isSilent()) return
    process.stderr.write(`${color.green("✔")} ${message}\n`)
  }

  /** warn は警告メッセージを stderr に出力する。 */
  warn(message: string): void {
    if (this.opts.json || this.opts.plain) return
    process.stderr.write(`${color.yellow("⚠")} ${message}\n`)
  }

  /** error はエラーメッセージを stderr に出力する。常に出力する。 */
  error(message: string): void {
    process.stderr.write(`${color.red("✗")} ${message}\n`)
  }

  /** debug はデバッグメッセージを stderr に出力する (-v フラグで有効)。 */
  debug(message: string): void {
    if ((this.opts.verbose ?? 0) >= 2) {
      process.stderr.write(`${color.dim("[debug]")} ${color.dim(message)}\n`)
    }
  }

  /** verbose はリクエスト情報等を stderr に出力する (-v で有効)。 */
  verbose(message: string): void {
    if ((this.opts.verbose ?? 0) >= 1) {
      process.stderr.write(`${color.dim("[info]")} ${message}\n`)
    }
  }

  private isSilent(): boolean {
    return !!(this.opts.quiet || this.opts.json || this.opts.plain)
  }
}

/** defaultLogger はデフォルト設定のロガーインスタンス。コマンド起動時に上書きされる。 */
export let defaultLogger = new Logger()

/** setDefaultLogger はデフォルトロガーを差し替える。 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger
}
