/**
 * whoami.test.ts — `cos auth whoami` コマンドのユニットテスト。
 *
 * --json 出力に csrfToken が含まれないこと、および id/name 等の通常フィールドが
 * 正しく出力されることを検証する。(issue #89)
 *
 * keychain は InMemoryTokenStore で代替し、API は msw でモックする。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { createAuthWhoamiCommand } from "@/commands/auth/whoami"
import { saveSession } from "@/core/auth/session"
import { InMemoryTokenStore } from "@/core/auth/store"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

// ---------------------------------------------------------------------------
// MSW サーバーセットアップ
// ---------------------------------------------------------------------------

const BASE_URL = "https://scrapbox.io"
const testSid = "s%3Atest-whoami-sid-abc123"

const server = setupServer(
  http.get(`${BASE_URL}/api/users/me`, () => {
    return HttpResponse.json({
      id: "yamada-taro-id",
      name: "yamada-taro",
      displayName: "山田太郎",
      email: "yamada@example.co.jp",
      csrfToken: "秘密のCSRFトークン",
      isPasswordUser: true,
    })
  }),
)

beforeAll(() => server.listen())
afterAll(() => server.close())

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** コマンドを実行するヘルパー。InMemoryTokenStore にセッションを事前セットアップする。 */
async function runWhoami(args: Record<string, unknown>) {
  const store = new InMemoryTokenStore()
  await saveSession(store, { profile: "default", sid: testSid })
  const command = createAuthWhoamiCommand({ createStore: () => store })
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

/** stdout への書き込みをキャプチャして JSON として返すヘルパー。 */
function captureJsonOutput(): () => unknown {
  const chunks: string[] = []
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => {
    const raw = chunks.join("")
    return JSON.parse(raw)
  }
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_SID")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock?.mockRestore()
  stderrMock.mockRestore()
  server.resetHandlers()
})

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("authWhoamiCommand — --json 出力のセキュリティ検証", () => {
  it("--json 出力に csrfToken が含まれないこと (issue #89)", async () => {
    const getJson = captureJsonOutput()
    await runWhoami({
      json: true,
      plain: false,
      quiet: false,
      verbose: false,
      profile: "default",
    })
    const output = getJson() as { data?: Record<string, unknown> }
    expect(output.data).not.toHaveProperty("csrfToken")
  })

  it("--json 出力に id・name・displayName が含まれること", async () => {
    const getJson = captureJsonOutput()
    await runWhoami({
      json: true,
      plain: false,
      quiet: false,
      verbose: false,
      profile: "default",
    })
    const output = getJson() as { data?: Record<string, unknown> }
    expect(output.data).toHaveProperty("id", "yamada-taro-id")
    expect(output.data).toHaveProperty("name", "yamada-taro")
    expect(output.data).toHaveProperty("displayName", "山田太郎")
  })
})
