/**
 * browser-login.ts — ブラウザ CDP 経由で connect.sid を自動取得するユースケース。
 *
 * BrowserFinder でブラウザバイナリを特定し、Spawner で起動後に
 * connectCdp でページに接続して connect.sid Cookie が現れるまでポーリングする。
 * すべての I/O 依存を BrowserLoginDeps として DI 化しているため、
 * テスト時はフェイク実装を注入して実 IO を回避できる。
 *
 * エラー種別:
 * - BROWSER_NOT_FOUND   : バイナリが見つからない
 * - BROWSER_SPAWN_FAILED: Bun.spawn が例外を throw した
 * - BROWSER_LOGIN_TIMEOUT: タイムアウト内に connect.sid が取得できなかった
 */

import type { connectCdp } from "@/infra/browser/cdp"
import type { BrowserFinder, Fetcher, WebSocketFactory } from "@/infra/browser/types"
import type { Spawner } from "@/infra/keychain/spawner"

/** BrowserLoginDeps は browserLogin が必要とする外部依存の注入ポイント。 */
export interface BrowserLoginDeps {
  /** spawner はブラウザプロセスを起動する関数。 */
  spawner: Spawner
  /** finder はブラウザバイナリのパスを探索する。 */
  finder: BrowserFinder
  /** connect は CDP クライアントを初期化する関数。 */
  connect: typeof connectCdp
  /** fetcher は HTTP リクエスト実装。CDP ポーリングに使用する。 */
  fetcher: Fetcher
  /** wsFactory は WebSocket インスタンスを生成する関数。 */
  wsFactory: WebSocketFactory
  /** mkTmpDir は一時ディレクトリを作成してパスを返す。 */
  mkTmpDir: () => Promise<string>
  /** rmTmpDir は一時ディレクトリを削除する。 */
  rmTmpDir: (path: string) => Promise<void>
  /** now は現在時刻 (ms) を返す。タイムアウト判定に使用する。 */
  now: () => number
  /** sleep は指定 ms 待機する。ポーリング間隔制御に使用する。 */
  sleep: (ms: number) => Promise<void>
}

/** BrowserLoginOpts は browserLogin に渡すオプション。 */
export interface BrowserLoginOpts {
  /** browserPath はブラウザバイナリのパス上書き。省略時は自動検出する。 */
  browserPath?: string
  /** port は CDP デバッグポート番号。 */
  port: number
  /** timeoutMs は connect.sid 取得待機タイムアウト (ms)。 */
  timeoutMs: number
  /** signal は AbortController の signal。中断に使用する。 */
  signal?: AbortSignal
}

/** COOKIE_POLL_INTERVAL_MS は connect.sid ポーリング間隔 (ms)。 */
const COOKIE_POLL_INTERVAL_MS = 1_000

/** SCRAPBOX_LOGIN_URL は Cosense ログインページの URL。 */
const SCRAPBOX_LOGIN_URL = "https://scrapbox.io/login"

/**
 * browserLogin はブラウザを CDP で操作し connect.sid Cookie を取得する。
 *
 * 取得した sid を { sid } として返す。呼び出し側で検証と保存を行うこと。
 * エラー時は必ず finally でクリーンアップが実行される。
 */
export async function browserLogin(
  deps: BrowserLoginDeps,
  opts: BrowserLoginOpts,
): Promise<{ sid: string }> {
  const { spawner, finder, connect, fetcher, wsFactory, mkTmpDir, rmTmpDir, now, sleep } = deps
  const { port, timeoutMs } = opts

  // abort 済み signal は即 reject する
  if (opts.signal?.aborted) {
    throw new Error("ブラウザログインがキャンセルされました")
  }

  // バイナリを解決する (exactOptionalPropertyTypes 対応: undefined は渡さない)
  const findOpts = opts.browserPath !== undefined ? { override: opts.browserPath } : undefined
  const browserBin = await finder.find(findOpts)
  if (!browserBin) {
    throw new Error(
      "BROWSER_NOT_FOUND: Chrome/Chromium が見つかりませんでした。" +
        " --browser-path でブラウザのパスを指定してください。",
    )
  }

  // 一時ディレクトリを作成する
  const tmpDir = await mkTmpDir()

  let child: { kill: () => void } | undefined
  let cdp: Awaited<ReturnType<typeof connect>> | undefined

  try {
    // ブラウザを起動する
    try {
      const proc = spawner(
        [
          browserBin,
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${tmpDir}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-features=Translate",
          SCRAPBOX_LOGIN_URL,
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
      // Bun の SubprocessLike は kill メソッドを持たないが
      // 実際の Bun.spawn は持つ。テスト用フェイクには不要なため省略する
      child = proc as unknown as { kill: () => void }
    } catch (err) {
      throw new Error(
        `BROWSER_SPAWN_FAILED: ブラウザの起動に失敗しました: ${(err as Error).message}`,
      )
    }

    // CDP に接続する
    cdp = await connect({ port, fetcher, wsFactory })

    // connect.sid が取得できるまでポーリングする
    const deadline = now() + timeoutMs
    while (true) {
      if (opts.signal?.aborted) {
        throw new Error("ブラウザログインがキャンセルされました")
      }
      if (now() >= deadline) {
        throw new Error(
          "BROWSER_LOGIN_TIMEOUT: タイムアウトまでに connect.sid を取得できませんでした",
        )
      }

      const cookies = await cdp.getCookies(["https://scrapbox.io"])
      const sidCookie = cookies.find((c) => c.name === "connect.sid" && c.value.length > 0)
      if (sidCookie) {
        return { sid: sidCookie.value }
      }

      await sleep(COOKIE_POLL_INTERVAL_MS)
    }
  } finally {
    // クリーンアップは例外の有無に関わらず実行する
    if (cdp) {
      await cdp.disconnect().catch(() => {})
      await cdp.closeBrowser().catch(() => {})
    }
    if (child && typeof child["kill"] === "function") {
      try {
        child["kill"]()
      } catch {
        // プロセスが既に終了している場合は無視する
      }
    }
    await rmTmpDir(tmpDir).catch(() => {})
  }
}
