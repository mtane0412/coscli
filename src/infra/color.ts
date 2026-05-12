/**
 * color.ts — picocolors ラッパー。
 *
 * --color=auto|always|never フラグと TTY 検出に基づき、
 * 色付け関数を提供する。
 *
 * picocolors はモジュールロード時に TTY を判定するため、
 * always/never モードでは createColors(boolean) で明示的に
 * ANSI 有効/無効のインスタンスを生成して使用する。
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
  else _enabled = process.stdout.isTTY ?? false // auto
}

/** isColorEnabled は現在の色付け設定を返す。 */
export function isColorEnabled(): boolean {
  if (_enabled !== null) return _enabled
  return process.stdout.isTTY ?? false
}

/**
 * _pc は現在の色付け設定に応じた picocolors インスタンスを返す。
 *
 * picocolors はモジュールロード時に isColorSupported を評価するため、
 * TTY でない環境 (CI・パイプ等) で `always` を指定した場合でも
 * デフォルトの pc では ANSI が出力されない。
 * createColors(boolean) で明示的に enabled を指定したインスタンスを使うことで
 * --color always/never を確実に反映する。
 */
function _pc(): ReturnType<typeof pc.createColors> {
  return pc.createColors(isColorEnabled())
}

/** color は色付け関数のラッパーオブジェクト。 */
export const color = {
  bold: (s: string) => _pc().bold(s),
  dim: (s: string) => _pc().dim(s),
  red: (s: string) => _pc().red(s),
  green: (s: string) => _pc().green(s),
  yellow: (s: string) => _pc().yellow(s),
  blue: (s: string) => _pc().blue(s),
  cyan: (s: string) => _pc().cyan(s),
  gray: (s: string) => _pc().gray(s),
}
