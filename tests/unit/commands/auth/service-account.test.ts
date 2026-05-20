/**
 * service-account.test.ts — `cos auth sa` コマンドのユニットテスト。
 *
 * 設定ファイル操作は一時ディレクトリの config.json5 で代替し、
 * API は msw でモックする。add / delete / list サブコマンドの動作を検証する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createAuthSaAddCommand,
  createAuthSaDeleteCommand,
  createAuthSaListCommand,
} from "@/commands/auth/service-account"
import { loadConfig } from "@/infra/config"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

// ---------------------------------------------------------------------------
// MSW サーバーセットアップ
// ---------------------------------------------------------------------------

const BASE_URL = "https://scrapbox.io"
// テスト用 Service Account キー (cs_ + 64桁16進数)
const TEST_SA_KEY = "cs_0000000000000000000000000000000000000000000000000000000000000001"
const TEST_PROJECT = "テスト事業プロジェクト"

const server = setupServer(
  http.get(`${BASE_URL}/api/pages/${encodeURIComponent(TEST_PROJECT)}`, ({ request }) => {
    const saKey = request.headers.get("x-service-account-access-key")
    if (saKey === TEST_SA_KEY) {
      return HttpResponse.json({
        projectName: TEST_PROJECT,
        skip: 0,
        limit: 1,
        count: 10,
        pages: [],
      })
    }
    return HttpResponse.json({ message: "Unauthorized" }, { status: 401 })
  }),
)

beforeAll(() => server.listen())
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

// ---------------------------------------------------------------------------
// 一時設定ファイル管理
// ---------------------------------------------------------------------------

let tmpDir: string
let configPath: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `coscli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
  configPath = join(tmpDir, "config.json5")
  // 空の設定ファイルを作成する
  writeFileSync(configPath, "{}")
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

type RunFn = (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>

/** auth sa add を実行するヘルパー。 */
async function runSaAdd(args: Record<string, unknown>) {
  const cmd = createAuthSaAddCommand({ configPath })
  if (typeof cmd.run !== "function") throw new Error("auth sa add コマンドが見つかりません")
  await (cmd.run as RunFn)({ args, cmd: {} as never, rawArgs: [] })
}

/** auth sa delete を実行するヘルパー。 */
async function runSaDelete(args: Record<string, unknown>) {
  const cmd = createAuthSaDeleteCommand({ configPath })
  if (typeof cmd.run !== "function") throw new Error("auth sa delete コマンドが見つかりません")
  await (cmd.run as RunFn)({ args, cmd: {} as never, rawArgs: [] })
}

/** auth sa list を実行するヘルパー。 */
async function runSaList(args: Record<string, unknown>) {
  const cmd = createAuthSaListCommand({ configPath })
  if (typeof cmd.run !== "function") throw new Error("auth sa list コマンドが見つかりません")
  await (cmd.run as RunFn)({ args, cmd: {} as never, rawArgs: [] })
}

/** 一時設定ファイルからロードした serviceAccounts を返すヘルパー。 */
function getStoredAccounts(): Record<string, string> {
  return loadConfig(configPath).serviceAccounts ?? {}
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
    if (!raw.trim()) return {}
    return JSON.parse(raw)
  }
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock?.mockRestore()
  stderrMock?.mockRestore()
})

// ---------------------------------------------------------------------------
// auth sa add テスト
// ---------------------------------------------------------------------------

describe("auth sa add", () => {
  it("有効なキーとプロジェクトを指定すると設定ファイルに保存される", async () => {
    await runSaAdd({
      project: TEST_PROJECT,
      key: TEST_SA_KEY,
      json: false,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    expect(getStoredAccounts()[TEST_PROJECT]).toBe(TEST_SA_KEY)
  })

  it("保存後に --json を指定すると project が JSON 出力に含まれる", async () => {
    const getJson = captureJsonOutput()

    await runSaAdd({
      project: TEST_PROJECT,
      key: TEST_SA_KEY,
      json: true,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    const output = getJson() as { data?: { project: string } }
    expect(output.data?.project).toBe(TEST_PROJECT)
  })

  it("不正なキー形式 (cs_ プレフィックスなし) は exit 5 で終了する", async () => {
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    const invalidKey = "invalid_key_without_cs_prefix"

    await runSaAdd({
      project: TEST_PROJECT,
      key: invalidKey,
      json: false,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    expect(exitMock).toHaveBeenCalledWith(5)
    // 不正なキーは設定ファイルに保存されないこと
    expect(getStoredAccounts()[TEST_PROJECT]).toBeUndefined()
  })

  it("プロジェクト名未指定は exit 5 で終了する", async () => {
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)

    await runSaAdd({
      key: TEST_SA_KEY,
      json: false,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("キー未指定は exit 5 で終了する", async () => {
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)

    await runSaAdd({
      project: TEST_PROJECT,
      json: false,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("API 認証が失敗した場合 (401) は保存せずに exit 2 で終了する", async () => {
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
    const wrongKey = "cs_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

    await runSaAdd({
      project: TEST_PROJECT,
      key: wrongKey,
      json: false,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    // 不正なキーは保存されないこと
    expect(getStoredAccounts()[TEST_PROJECT]).toBeUndefined()
    expect(exitMock).toHaveBeenCalledWith(2)
  })
})

// ---------------------------------------------------------------------------
// auth sa delete テスト
// ---------------------------------------------------------------------------

describe("auth sa delete", () => {
  it("保存済みキーを削除できる", async () => {
    // 事前に保存しておく
    writeFileSync(configPath, JSON.stringify({ serviceAccounts: { [TEST_PROJECT]: TEST_SA_KEY } }))

    await runSaDelete({
      project: TEST_PROJECT,
      json: false,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    expect(getStoredAccounts()[TEST_PROJECT]).toBeUndefined()
  })

  it("存在しないプロジェクトを削除しようとしても正常終了する", async () => {
    await runSaDelete({
      project: "存在しないプロジェクト",
      json: false,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    expect(exitMock).not.toHaveBeenCalledWith(1)
  })

  it("プロジェクト名未指定は exit 5 で終了する", async () => {
    stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)

    await runSaDelete({
      json: false,
      quiet: false,
      plain: false,
      "results-only": false,
    })

    expect(exitMock).toHaveBeenCalledWith(5)
  })
})

// ---------------------------------------------------------------------------
// auth sa list テスト
// ---------------------------------------------------------------------------

describe("auth sa list", () => {
  it("保存済みの SA プロジェクト一覧を返す", async () => {
    const getJson = captureJsonOutput()
    // 複数プロジェクトを事前に設定する
    writeFileSync(
      configPath,
      JSON.stringify({
        serviceAccounts: {
          プロジェクトA: TEST_SA_KEY,
          プロジェクトB: TEST_SA_KEY,
        },
      }),
    )

    await runSaList({ json: true, quiet: false, plain: false, "results-only": false })

    const output = getJson() as { data?: { projects: string[] } }
    expect(output.data?.projects).toContain("プロジェクトA")
    expect(output.data?.projects).toContain("プロジェクトB")
  })

  it("SA キーが 1 件も登録されていない場合は空配列を返す", async () => {
    const getJson = captureJsonOutput()

    await runSaList({ json: true, quiet: false, plain: false, "results-only": false })

    const output = getJson() as { data?: { projects: string[] } }
    expect(output.data?.projects).toEqual([])
  })
})
