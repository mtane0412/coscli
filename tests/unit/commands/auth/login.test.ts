/**
 * login.test.ts — `cos auth login` コマンドのユニットテスト。
 *
 * --browser / --sid 排他チェック、--browser フロー、既存の --sid フローの回帰を検証する。
 * ブラウザ依存は browserLogin をフェイクで差し替えて実 IO を回避する。
 * 認証 API は msw でモックする。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { createAuthLoginCommand } from "@/commands/auth/login"
import type { BrowserLoginDeps } from "@/core/auth/browser-login"
import { InMemoryTokenStore } from "@/core/auth/store"
import { runCommand } from "citty"
import { http, HttpResponse } from "msw"
import { useMswServer } from "../../../helpers/msw"

// ---------------------------------------------------------------------------
// MSW サーバーセットアップ
// ---------------------------------------------------------------------------

const BASE_URL = "https://scrapbox.io"
const testUserDisplayName = "田中花子"
// SID はHTTPヘッダーに設定されるため ASCII のみ使用する
const testSid = "s%3Atest-browser-sid-xyz987"

useMswServer([
  http.get(`${BASE_URL}/api/users/me`, () => {
    return HttpResponse.json({
      id: "tanaka-hanako-id",
      name: "tanaka-hanako",
      displayName: testUserDisplayName,
      csrfToken: "test-csrf-token",
    })
  }),
])

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** フェイク browserLogin を返すヘルパー。成功時は testSid を返す。 */
function buildFakeBrowserLogin(overrides?: {
  sid?: string
  error?: Error
}): (
  deps: BrowserLoginDeps,
  opts: { port: number; timeoutMs: number },
) => Promise<{ sid: string }> {
  return async (_deps, _opts) => {
    if (overrides?.error) throw overrides.error
    return { sid: overrides?.sid ?? testSid }
  }
}

/** コマンドを実行するヘルパー。 */
async function runLogin(
  args: Record<string, unknown>,
  fakeBrowserLogin?: ReturnType<typeof buildFakeBrowserLogin>,
) {
  // exactOptionalPropertyTypes 対応: undefined は渡さない。
  // createStore は OS keychain を回避するため InMemoryTokenStore を注入する。
  const deps =
    fakeBrowserLogin !== undefined
      ? { browserLogin: fakeBrowserLogin, createStore: () => new InMemoryTokenStore() }
      : { createStore: () => new InMemoryTokenStore() }
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
})

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("authLoginCommand — 排他チェック", () => {
  it("--browser と --sid を同時指定した場合は exit 5 で終了する", async () => {
    try {
      await runLogin({
        browser: true,
        sid: "何かのSID",
        input: true,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
      })
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--browser と --no-input を同時指定した場合は exit 5 で終了する", async () => {
    try {
      await runLogin({
        browser: true,
        input: false,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
      })
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })
})

describe("authLoginCommand — --browser フロー", () => {
  it("browserLogin が成功した場合にログイン完了メッセージを表示する", async () => {
    const fakeBrowserLogin = buildFakeBrowserLogin({ sid: testSid })
    await runLogin(
      {
        browser: true,
        input: true,
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
    expect(exitMock).not.toHaveBeenCalledWith(124)
  })

  it("BROWSER_NOT_FOUND エラー時は exit 5 で終了する", async () => {
    const fakeBrowserLogin = buildFakeBrowserLogin({
      error: new Error("BROWSER_NOT_FOUND: Chrome が見つかりません"),
    })
    try {
      await runLogin(
        {
          browser: true,
          input: true,
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
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("BROWSER_SPAWN_FAILED エラー時は exit 1 で終了する", async () => {
    const fakeBrowserLogin = buildFakeBrowserLogin({
      error: new Error("BROWSER_SPAWN_FAILED: ブラウザの起動に失敗しました"),
    })
    try {
      await runLogin(
        {
          browser: true,
          input: true,
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
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(1)
  })

  it("BROWSER_LOGIN_TIMEOUT エラー時は exit 124 で終了する", async () => {
    const fakeBrowserLogin = buildFakeBrowserLogin({
      error: new Error("BROWSER_LOGIN_TIMEOUT: タイムアウト"),
    })
    try {
      await runLogin(
        {
          browser: true,
          input: true,
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
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(124)
  })
})

describe("authLoginCommand — --sid フロー (回帰)", () => {
  it("--sid 指定時は getMe で検証してログインする", async () => {
    await runLogin({
      sid: testSid,
      input: true,
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
    expect(exitMock).not.toHaveBeenCalledWith(124)
  })

  it("--no-input かつ --sid 未指定の場合は exit 5 で終了する", async () => {
    try {
      await runLogin({
        input: false,
        browser: false,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
      })
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("rawArgs ['--no-input'] が citty parser を経由しても exit 5 で終了する (issue #39 回帰)", async () => {
    // citty パーサは --no-X を args.X = false に変換する。
    // このテストは CLI から実際に --no-input を渡した場合の経路を再現し、
    // 修正前は対話プロンプトに突入してハングすることを確認するために追加した。
    const command = createAuthLoginCommand({ createStore: () => new InMemoryTokenStore() })
    try {
      await runCommand(command, { rawArgs: ["--no-input"] })
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })
})

// ---------------------------------------------------------------------------
// --pat フロー
// ---------------------------------------------------------------------------

// テスト用 PAT (pat_ + 64桁小文字16進数)
const VALID_PAT = `pat_${"a".repeat(64)}`

describe("authLoginCommand — --pat フロー", () => {
  it("--pat で有効な PAT を渡した場合に TokenStore に保存される", async () => {
    // InMemoryTokenStore への参照を保持して保存後に確認する
    const store = new InMemoryTokenStore()
    const command = createAuthLoginCommand({ createStore: () => store })
    await (command.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)(
      {
        args: {
          pat: VALID_PAT,
          input: true,
          profile: "default",
          json: false,
          plain: false,
          quiet: false,
          verbose: false,
        },
        cmd: {} as never,
        rawArgs: [],
      },
    )
    // PAT 値が default プロファイルに保存されていること
    const saved = await store.load("default")
    expect(saved).toBe(VALID_PAT)
  })

  it("--pat と --sid を同時指定した場合は exit 5 で終了する (PAT_SID_EXCLUSIVE)", async () => {
    try {
      await runLogin({
        pat: VALID_PAT,
        sid: "s%3Atest-sid",
        input: true,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
      })
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    // writeErrorJson は stdout に書き込む
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("PAT_SID_EXCLUSIVE")
  })

  it("--pat と --browser を同時指定した場合は exit 5 で終了する (PAT_BROWSER_EXCLUSIVE)", async () => {
    try {
      await runLogin({
        pat: VALID_PAT,
        browser: true,
        input: true,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
        "browser-port": 9222,
        "browser-timeout": 300,
      })
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("PAT_BROWSER_EXCLUSIVE")
  })

  it("--pat にフォーマット不正な値を渡した場合は exit 5 で終了する (INVALID_PERSONAL_ACCESS_TOKEN)", async () => {
    try {
      await runLogin({
        pat: "pat_invalid_too_short",
        input: true,
        profile: "default",
        json: false,
        plain: false,
        quiet: false,
        verbose: false,
      })
    } catch {
      // exitWithError による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as Array<[string]>).map((c) => c[0]).join("")
    expect(stdoutOutput).toContain("INVALID_PERSONAL_ACCESS_TOKEN")
  })
})
