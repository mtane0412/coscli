/**
 * whoami.pat.test.ts — PAT 認証時の `cos auth whoami` 動作テスト。
 *
 * keychain に PAT (pat_ プレフィックス値) が保存されている場合:
 * - JSON 出力に authMethod: "pat" が含まれること
 * - プレーン出力に「認証種別」行が含まれること
 * - csrfToken は JSON 出力から除外されること
 *
 * SID 認証の場合も authMethod: "sid" を含むことを合わせて検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { createAuthWhoamiCommand } from "@/commands/auth/whoami"
import { saveSession } from "@/core/auth/session"
import { InMemoryTokenStore } from "@/core/auth/store"
import { http, HttpResponse } from "msw"
import { useMswServer } from "../../../helpers/msw"

// ---------------------------------------------------------------------------
// MSW サーバーセットアップ
// ---------------------------------------------------------------------------

const BASE_URL = "https://scrapbox.io"
const VALID_PAT = `pat_${"a".repeat(64)}`
const testSid = "s%3Atest-whoami-sid-abc123"

useMswServer([
  http.get(`${BASE_URL}/api/users/me`, ({ request }) => {
    const pat = request.headers.get("x-personal-access-token")
    if (pat === VALID_PAT) {
      // PAT セッション: csrfToken なし
      return HttpResponse.json({
        id: "tanaka-hanako-id",
        name: "tanaka-hanako",
        displayName: "田中花子",
        email: "tanaka@example.co.jp",
        isPasswordUser: false,
      })
    }
    // SID セッション: csrfToken あり
    return HttpResponse.json({
      id: "yamada-taro-id",
      name: "yamada-taro",
      displayName: "山田太郎",
      email: "yamada@example.co.jp",
      csrfToken: "秘密のCSRFトークン",
      isPasswordUser: true,
    })
  }),
])

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

/** PAT を keychain に保存してコマンドを実行するヘルパー。 */
async function runWhoamiWithPat(args: Record<string, unknown>) {
  const store = new InMemoryTokenStore()
  // PAT を sid フィールドとして保存 (TokenStore は単一 string を保持する設計)
  await saveSession(store, { profile: "default", sid: VALID_PAT })
  const command = createAuthWhoamiCommand({ createStore: () => store })
  await (command.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

/** SID を keychain に保存してコマンドを実行するヘルパー。 */
async function runWhoamiWithSid(args: Record<string, unknown>) {
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

/** stdout 出力をキャプチャして JSON として返すヘルパー。 */
function captureJsonOutput(): () => unknown {
  const chunks: string[] = []
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => JSON.parse(chunks.join(""))
}

/** stdout 出力をキャプチャしてテキストとして返すヘルパー。 */
function capturePlainOutput(): () => string {
  const chunks: string[] = []
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => chunks.join("")
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_SID")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock?.mockRestore()
  stderrMock.mockRestore()
})

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

const jsonArgs = {
  json: true,
  plain: false,
  quiet: false,
  verbose: false,
  profile: "default",
  "results-only": false,
}

const plainArgs = {
  json: false,
  plain: true,
  quiet: false,
  verbose: false,
  profile: "default",
  "results-only": false,
}

describe("authWhoamiCommand — PAT 認証時の出力", () => {
  it("PAT 認証時: JSON 出力に authMethod: 'pat' が含まれること", async () => {
    const getJson = captureJsonOutput()
    await runWhoamiWithPat(jsonArgs)
    const output = getJson() as { data?: Record<string, unknown> }
    expect(output.data).toHaveProperty("authMethod", "pat")
  })

  it("PAT 認証時: JSON 出力に csrfToken が含まれないこと", async () => {
    const getJson = captureJsonOutput()
    await runWhoamiWithPat(jsonArgs)
    const output = getJson() as { data?: Record<string, unknown> }
    expect(output.data).not.toHaveProperty("csrfToken")
  })

  it("PAT 認証時: JSON 出力に name・id が含まれること", async () => {
    const getJson = captureJsonOutput()
    await runWhoamiWithPat(jsonArgs)
    const output = getJson() as { data?: Record<string, unknown> }
    expect(output.data).toHaveProperty("name", "tanaka-hanako")
    expect(output.data).toHaveProperty("id", "tanaka-hanako-id")
  })

  it("PAT 認証時: プレーン出力に「認証種別」行が含まれること", async () => {
    const getPlain = capturePlainOutput()
    await runWhoamiWithPat(plainArgs)
    const output = getPlain()
    expect(output).toContain("認証種別")
    expect(output).toContain("pat")
  })
})

describe("authWhoamiCommand — SID 認証時の authMethod 出力", () => {
  it("SID 認証時: JSON 出力に authMethod: 'sid' が含まれること", async () => {
    const getJson = captureJsonOutput()
    await runWhoamiWithSid(jsonArgs)
    const output = getJson() as { data?: Record<string, unknown> }
    expect(output.data).toHaveProperty("authMethod", "sid")
  })

  it("SID 認証時: プレーン出力に「認証種別」行と sid が含まれること", async () => {
    const getPlain = capturePlainOutput()
    await runWhoamiWithSid(plainArgs)
    const output = getPlain()
    expect(output).toContain("認証種別")
    expect(output).toContain("sid")
  })
})
