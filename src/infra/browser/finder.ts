/**
 * finder.ts — OS 別 Chrome/Chromium バイナリを探索する BrowserFinder 実装。
 *
 * macOS / Linux / Windows の標準インストールパスを順に検索し、
 * 最初に見つかったパスを返す。override 引数が指定された場合は最優先で確認する。
 * テスト時は platform と existsChecker を差し替えることで実 FS を使わず検証できる。
 */

import type { BrowserFinder } from "@/infra/browser/types"

/** ExistsChecker はファイルの存在確認を行う関数の型。テストで差し替え可能。 */
export type ExistsChecker = (path: string) => Promise<boolean>

/** PlatformBrowserFinderOpts はコンストラクタのオプション。 */
export interface PlatformBrowserFinderOpts {
  /** platform は OS 判定に使用するプラットフォーム文字列。省略時は process.platform。 */
  platform?: NodeJS.Platform
  /** existsChecker はファイル存在確認関数。省略時は Bun.file().exists() を使用する。 */
  existsChecker?: ExistsChecker
}

/** macOS での Chrome/Chromium 標準パス (優先順)。 */
const MACOS_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
]

/** Linux での Chrome/Chromium 標準パス (優先順)。 */
const LINUX_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
]

/** Windows での Chrome 標準パス (優先順)。 */
const WINDOWS_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
]

/**
 * PlatformBrowserFinder は OS に応じた Chrome/Chromium バイナリを探索する。
 * BrowserFinder インターフェイスを実装する。
 */
export class PlatformBrowserFinder implements BrowserFinder {
  private readonly platform: NodeJS.Platform
  private readonly existsChecker: ExistsChecker

  constructor(opts: PlatformBrowserFinderOpts = {}) {
    this.platform = opts.platform ?? (process.platform as NodeJS.Platform)
    this.existsChecker = opts.existsChecker ?? ((path) => Bun.file(path).exists())
  }

  /**
   * find はブラウザバイナリのパスを返す。
   * override が指定された場合はそのパスの存在のみ確認し、存在しなければ null を返す。
   * override 未指定時は OS 標準パスを優先順に確認し、最初に見つかったパスを返す。
   */
  async find(opts?: { override?: string }): Promise<string | null> {
    if (opts?.override !== undefined) {
      const exists = await this.existsChecker(opts.override)
      return exists ? opts.override : null
    }

    const candidates = this.getCandidates()
    for (const candidate of candidates) {
      if (await this.existsChecker(candidate)) {
        return candidate
      }
    }
    return null
  }

  /** getCandidates は現在の OS に対応するパス候補一覧を返す。 */
  private getCandidates(): string[] {
    if (this.platform === "darwin") return MACOS_CANDIDATES
    if (this.platform === "linux") return LINUX_CANDIDATES
    if (this.platform === "win32") return WINDOWS_CANDIDATES
    return []
  }
}

/** defaultBrowserFinder は本番環境で使用するデフォルトの BrowserFinder インスタンス。 */
export const defaultBrowserFinder = new PlatformBrowserFinder()
