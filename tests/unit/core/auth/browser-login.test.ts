/**
 * browser-login.test.ts — browserLogin ユースケースのユニットテスト。
 *
 * Spawner / BrowserFinder / connectCdp / mkTmpDir / now / sleep を
 * すべてフェイク実装で差し替えて実 IO を回避する。
 * クリーンアップ (tmpDir 削除・WS 切断) が finally で必ず実行されることも検証する。
 */

import { describe, expect, it } from "bun:test"
import { browserLogin } from "@/core/auth/browser-login"
import type { BrowserLoginDeps, BrowserLoginOpts } from "@/core/auth/browser-login"
import type { CdpClient, CdpCookie } from "@/infra/browser/types"
import { fakeProcess } from "../../../unit/infra/_keychain-test-helpers"

// ---------------------------------------------------------------------------
// テスト用フェイク
// ---------------------------------------------------------------------------

const TEST_SID = "テスト用connect.sid-abcdef12345"
const loggedInCookies: CdpCookie[] = [
  {
    name: "connect.sid",
    value: TEST_SID,
    domain: ".scrapbox.io",
    path: "/",
    httpOnly: true,
    secure: true,
  },
]

/** buildFakeCdpClient はフェイク CdpClient を生成する。 */
function buildFakeCdpClient(overrides?: Partial<CdpClient>): {
  client: CdpClient
  disconnectCallCount: () => number
  closeBrowserCallCount: () => number
} {
  let disconnectCount = 0
  let closeBrowserCount = 0

  const client: CdpClient = {
    navigate: async (_url: string) => {},
    getCookies: async () => loggedInCookies,
    closeBrowser: async () => {
      closeBrowserCount++
    },
    disconnect: async () => {
      disconnectCount++
    },
    ...overrides,
  }

  return {
    client,
    disconnectCallCount: () => disconnectCount,
    closeBrowserCallCount: () => closeBrowserCount,
  }
}

/** buildDeps はテスト用のデフォルト deps を生成する。 */
function buildDeps(overrides?: Partial<BrowserLoginDeps>): {
  deps: BrowserLoginDeps
  tmpDirs: string[]
  removedDirs: string[]
  cdpClient: CdpClient
  disconnectCallCount: () => number
  closeBrowserCallCount: () => number
} {
  const tmpDirs: string[] = []
  const removedDirs: string[] = []
  const {
    client: cdpClient,
    disconnectCallCount,
    closeBrowserCallCount,
  } = buildFakeCdpClient(
    overrides?.connect
      ? undefined
      : {
          getCookies: async () => loggedInCookies,
        },
  )

  const deps: BrowserLoginDeps = {
    spawner: (_cmd, _opts) => fakeProcess("", "", 0),
    finder: {
      // override が指定された場合はそのパスを返し、未指定の場合はデフォルトパスを返す
      find: async (opts?) => opts?.override ?? "/usr/bin/google-chrome-テスト",
    },
    connect: async () => cdpClient,
    // isAuthenticated が /api/users/me を叩くため、id を含む有効なレスポンスを返す
    fetcher: async (url) => {
      if (url.includes("/api/users/me")) {
        return new Response(JSON.stringify({ id: "test-user-id", name: "テストユーザー" }))
      }
      return new Response("")
    },
    wsFactory: (_url) => {
      throw new Error("wsFactory は connect 経由で使用される")
    },
    mkTmpDir: async () => {
      const dir = `/tmp/coscli-cdp-テスト-${tmpDirs.length}`
      tmpDirs.push(dir)
      return dir
    },
    rmTmpDir: async (path) => {
      removedDirs.push(path)
    },
    now: () => 0,
    sleep: async () => {},
    ...overrides,
  }

  return { deps, tmpDirs, removedDirs, cdpClient, disconnectCallCount, closeBrowserCallCount }
}

const defaultOpts: BrowserLoginOpts = {
  port: 9222,
  timeoutMs: 300_000,
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("browserLogin", () => {
  describe("ハッピーパス", () => {
    it("connect.sid を取得して返す", async () => {
      const { deps } = buildDeps()
      const result = await browserLogin(deps, defaultOpts)
      expect(result.sid).toBe(TEST_SID)
    })

    it("spawner にブラウザパスとフラグを渡して起動する", async () => {
      const spawnedCmds: string[][] = []
      const { deps } = buildDeps({
        spawner: (cmd, _opts) => {
          spawnedCmds.push(cmd)
          return fakeProcess("", "", 0)
        },
      })

      await browserLogin(deps, defaultOpts)

      expect(spawnedCmds).toHaveLength(1)
      const cmd = spawnedCmds[0]
      expect(cmd).toBeDefined()
      if (!cmd) return
      // ブラウザパスが先頭に来る
      expect(cmd[0]).toBe("/usr/bin/google-chrome-テスト")
      // デバッグポートフラグが含まれる
      expect(cmd.some((a) => a.includes("--remote-debugging-port=9222"))).toBeTrue()
      // ユーザーデータディレクトリが含まれる
      expect(cmd.some((a) => a.includes("--user-data-dir="))).toBeTrue()
    })

    it("tmp ディレクトリを作成して最終的に削除する", async () => {
      const { deps, tmpDirs, removedDirs } = buildDeps()
      await browserLogin(deps, defaultOpts)

      expect(tmpDirs).toHaveLength(1)
      const expectedDir = tmpDirs[0]
      if (expectedDir === undefined) throw new Error("tmpDirs[0] が存在しません")
      expect(removedDirs).toContain(expectedDir)
    })

    it("正常完了後にディスコネクトとブラウザクローズを呼ぶ", async () => {
      const { client: cdpClient, disconnectCallCount, closeBrowserCallCount } = buildFakeCdpClient()
      const { deps } = buildDeps({ connect: async () => cdpClient })

      await browserLogin(deps, defaultOpts)

      expect(disconnectCallCount()).toBe(1)
      expect(closeBrowserCallCount()).toBe(1)
    })

    it("--browser-path が指定された場合はそのパスでブラウザを起動する", async () => {
      const spawnedCmds: string[][] = []
      const { deps } = buildDeps({
        spawner: (cmd, _opts) => {
          spawnedCmds.push(cmd)
          return fakeProcess("", "", 0)
        },
      })
      const customBrowserPath = "/カスタムパス/chrome"
      await browserLogin(deps, { ...defaultOpts, browserPath: customBrowserPath })

      expect(spawnedCmds[0]?.[0]).toBe(customBrowserPath)
    })
  })

  describe("ブラウザ未検出", () => {
    it("finder が null を返した場合は BrowserNotFoundError を throw する", async () => {
      const { deps } = buildDeps({ finder: { find: async () => null } })
      await expect(browserLogin(deps, defaultOpts)).rejects.toThrow("BROWSER_NOT_FOUND")
    })
  })

  describe("spawn 失敗", () => {
    it("spawner が例外を throw した場合は BrowserSpawnError を throw する", async () => {
      const { deps } = buildDeps({
        spawner: () => {
          throw Object.assign(new Error("spawn: ENOENT"), { code: "ENOENT" })
        },
      })
      await expect(browserLogin(deps, defaultOpts)).rejects.toThrow("BROWSER_SPAWN_FAILED")
    })

    it("spawn 失敗時も tmp ディレクトリを削除する (finally)", async () => {
      const { deps, tmpDirs, removedDirs } = buildDeps({
        spawner: () => {
          throw new Error("spawn 失敗テスト")
        },
      })
      await expect(browserLogin(deps, defaultOpts)).rejects.toThrow()
      // tmpDir が作成された場合は削除されていることを確認する
      const spawnFailDir = tmpDirs[0]
      if (spawnFailDir !== undefined) {
        expect(removedDirs).toContain(spawnFailDir)
      }
    })
  })

  describe("タイムアウト", () => {
    it("timeoutMs 超過時は BROWSER_LOGIN_TIMEOUT エラーで reject する", async () => {
      let nowVal = 0
      // getCookies が常に空を返す (connect.sid が来ない)
      const { client: cdpClient } = buildFakeCdpClient({
        getCookies: async () => [],
      })
      const { deps } = buildDeps({
        connect: async () => cdpClient,
        // now を使ってタイムアウトを制御する
        now: () => {
          nowVal += 600_000 // 毎回 600 秒進む (タイムアウト超過)
          return nowVal
        },
        sleep: async () => {},
      })

      await expect(browserLogin(deps, { ...defaultOpts, timeoutMs: 300_000 })).rejects.toThrow(
        "BROWSER_LOGIN_TIMEOUT",
      )
    })

    it("タイムアウト時も cleanup が実行される", async () => {
      let nowVal = 0
      const {
        client: cdpClient,
        disconnectCallCount,
        closeBrowserCallCount,
      } = buildFakeCdpClient({
        getCookies: async () => [],
      })
      const { deps, tmpDirs, removedDirs } = buildDeps({
        connect: async () => cdpClient,
        now: () => {
          nowVal += 600_000
          return nowVal
        },
        sleep: async () => {},
      })

      await expect(browserLogin(deps, defaultOpts)).rejects.toThrow()
      const timeoutCleanupDir = tmpDirs[0]
      if (timeoutCleanupDir !== undefined) {
        expect(removedDirs).toContain(timeoutCleanupDir)
      }
      expect(disconnectCallCount()).toBe(1)
      expect(closeBrowserCallCount()).toBe(1)
    })
  })

  describe("AbortSignal", () => {
    it("既に abort 済みの signal を渡した場合はすぐに reject する", async () => {
      const controller = new AbortController()
      controller.abort()
      const { deps } = buildDeps()

      await expect(
        browserLogin(deps, { ...defaultOpts, signal: controller.signal }),
      ).rejects.toThrow()
    })
  })
})
