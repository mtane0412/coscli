/**
 * color.ts — picocolors ラッパー。
 *
 * --color=auto|always|never フラグと TTY 検出に基づき、
 * 色付け関数を提供する。
 */

import pc from "picocolors"

export type ColorMode = "auto" | "always" | "never"

let _enabled: boolean | null = null

/**
 * initColor は色付けを初期化する。
 * 呼び出し前はデフォルト (auto: TTY 検出) が使われる。
 */
export function initColor(mode: ColorMode): void {
  if (mode === "always") _enabled = true
  else if (mode === "never") _enabled = false
  else _enabled = process.stdout.isTTY // auto
}

/** isColorEnabled は現在の色付け設定を返す。 */
export function isColorEnabled(): boolean {
  if (_enabled !== null) return _enabled
  return process.stdout.isTTY ?? false
}

/** color は色付け関数のラッパーオブジェクト。 */
export const color = {
  bold: (s: string) => (isColorEnabled() ? pc.bold(s) : s),
  dim: (s: string) => (isColorEnabled() ? pc.dim(s) : s),
  red: (s: string) => (isColorEnabled() ? pc.red(s) : s),
  green: (s: string) => (isColorEnabled() ? pc.green(s) : s),
  yellow: (s: string) => (isColorEnabled() ? pc.yellow(s) : s),
  blue: (s: string) => (isColorEnabled() ? pc.blue(s) : s),
  cyan: (s: string) => (isColorEnabled() ? pc.cyan(s) : s),
  gray: (s: string) => (isColorEnabled() ? pc.gray(s) : s),
}
