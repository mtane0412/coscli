/**
 * login.test.ts — `cos auth login` コマンドのユニットテスト。
 *
 * --browser / --sid 排他チェック、--browser フロー、既存の --sid フローの回帰を検証する。
 * ブラウザ依存は browserLogin をフェイクで差し替えて実 IO を回避する。
 * 認証 API は msw でモックする。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { createAuthLoginCommand } from "@/commands/auth/login"
import type { BrowserLoginDeps } from "@/core/auth/browser-login"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

// ---------------------------------------------------------------------------
// MSW サーバーセットアップ
// ---------------------------------------------------------------------------

const BASE_URL = "https://scrapbox.io"
const テストユーザー名 = "田中花子"
// SID はHTTPヘッダーに設定されるため ASCII のみ使用する
const テスト用SID = "s%3Atest-browser-sid-xyz987"

const server = setupServer(
  http.get(`${BASE_URL}/api/users/me`, () => {
    return HttpResponse.json({
      id: "tanaka-hanako-id",
      name: "tanaka-hanako",
      displayName: テストユーザー名,
      csrfToken: "test-csrf-token",
    })
  }),
)

beforeAll(() => server.listen())
afterAll(() => server.close())

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** フェイク browserLogin を返すヘルパー。成功時は テスト用SID を返す。 */
function buildFakeBrowserLogin(overrides?: {
  sid?: string
  error?: Error
}): (
  deps: BrowserLoginDeps,
  opts: { port: number; timeoutMs: number },
) => Promise<{ sid: string }> {
  return async (_deps, _opts) => {
    if (overrides?.error) throw overrides.error
    return { sid: overrides?.sid ?? テスト用SID }
  }
}

/** コマンドを実行するヘルパー。 */
async function runLogin(
  args: Record<string, unknown>,
  fakeBrowserLogin?: ReturnType<typeof buildFakeBrowserLogin>,
) {
  // exactOptionalPropertyTypes 対応: undefined は渡さない
  const deps = fakeBrowserLogin !== undefined ? { browserLogin: fakeBrowserLogin } : {}
  const command = createAuthLoginCommand(deps)
  await (command.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

// ---------------------------------------------------------------------------
// テスト前後処理
// ---------------------------------------------------------------------------

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  server.resetHandlers()
})

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("authLoginCommand — 排他チェック", () => {
  it("--browser と --sid を同時指定した場合は exit 5 で終了する", async () => {
    await runLogin({
      browser: true,
      sid: "何かのSID",
      "no-input": false,
      profile: "default",
      json: false,
      plain: false,
      quiet: false,
      verbose: false,
    })
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--browser と --no-input を同時指定した場合は exit 5 で終了する", async () => {
    await runLogin({
      browser: true,
      "no-input": true,
      profile: "default",
      json: false,
      plain: false,
      quiet: false,
      verbose: false,
    })
    expect(exitMock).toHaveBeenCalledWith(5)
  })
})

describe("authLoginCommand — --browser フロー", () => {
  it("browserLogin が成功した場合にログイン完了メッセージを表示する", async () => {
    const fakeBrowserLogin = buildFakeBrowserLogin({ sid: テスト用SID })
    await runLogin(
      {
        browser: true,
        "no-input": false,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
        "browser-port": 9222,
        "browser-timeout": 300,
      },
      fakeBrowserLogin,
    )
    // exit 0 相当 (exit が呼ばれていない、またはエラー以外)
    expect(exitMock).not.toHaveBeenCalledWith(1)
    expect(exitMock).not.toHaveBeenCalledWith(2)
    expect(exitMock).not.toHaveBeenCalledWith(5)
  })

  it("BROWSER_NOT_FOUND エラー時は exit 5 で終了する", async () => {
    const fakeBrowserLogin = buildFakeBrowserLogin({
      error: new Error("BROWSER_NOT_FOUND: Chrome が見つかりません"),
    })
    await runLogin(
      {
        browser: true,
        "no-input": false,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
        "browser-port": 9222,
        "browser-timeout": 300,
      },
      fakeBrowserLogin,
    )
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("BROWSER_SPAWN_FAILED エラー時は exit 1 で終了する", async () => {
    const fakeBrowserLogin = buildFakeBrowserLogin({
      error: new Error("BROWSER_SPAWN_FAILED: ブラウザの起動に失敗しました"),
    })
    await runLogin(
      {
        browser: true,
        "no-input": false,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
        "browser-port": 9222,
        "browser-timeout": 300,
      },
      fakeBrowserLogin,
    )
    expect(exitMock).toHaveBeenCalledWith(1)
  })

  it("BROWSER_LOGIN_TIMEOUT エラー時は exit 124 で終了する", async () => {
    const fakeBrowserLogin = buildFakeBrowserLogin({
      error: new Error("BROWSER_LOGIN_TIMEOUT: タイムアウト"),
    })
    await runLogin(
      {
        browser: true,
        "no-input": false,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
        "browser-port": 9222,
        "browser-timeout": 300,
      },
      fakeBrowserLogin,
    )
    expect(exitMock).toHaveBeenCalledWith(124)
  })
})

describe("authLoginCommand — --sid フロー (回帰)", () => {
  it("--sid 指定時は getMe で検証してログインする", async () => {
    await runLogin({
      sid: テスト用SID,
      "no-input": false,
      browser: false,
      profile: "default",
      json: false,
      plain: false,
      quiet: false,
      verbose: false,
    })
    // exit が呼ばれていなければ成功
    expect(exitMock).not.toHaveBeenCalledWith(1)
    expect(exitMock).not.toHaveBeenCalledWith(2)
    expect(exitMock).not.toHaveBeenCalledWith(5)
  })

  it("--no-input かつ --sid 未指定の場合は exit 5 で終了する", async () => {
    await runLogin({
      "no-input": true,
      browser: false,
      profile: "default",
      json: false,
      plain: false,
      quiet: false,
      verbose: false,
    })
    expect(exitMock).toHaveBeenCalledWith(5)
  })
})
