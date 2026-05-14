/**
 * sync/push.test.ts — `cos sync push [<title>]` コマンドのテスト。
 *
 * - 入力バリデーション・sandbox・exit コードのテスト
 * - --all モードでの不正ファイル名スキップ動作のテスト (issue #91)
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { syncPushCommand } from "@/commands/sync/push"

/** syncPush に渡された title をキャプチャする */
const capturedPushTitles: string[] = []

// Bun は mock.module をファイル先頭にホイストするため import より前に評価される
// node:fs をモックして readdirSync / existsSync を差し替える。
// realFs を spread して readFileSync 等の他メソッドは実装をそのまま使う。
mock.module("node:fs", () => {
  // biome-ignore lint/style/useNodejsImportProtocol: モックバイパスに "node:" なしが必要
  const realFs = require("fs") as typeof import("node:fs")
  return {
    ...realFs,
    // .coscli 配下のパスは同期メタディレクトリとして存在するものとみなす
    existsSync: (p: unknown) => {
      if (typeof p === "string" && p.includes(".coscli")) return true
      return realFs.existsSync(p as Parameters<typeof realFs.existsSync>[0])
    },
    readdirSync: (_dir: unknown) => ["CON.json", "正常なページ.json"],
  }
})

// syncPush をモックして実際の API コールを回避し、呼び出し引数をキャプチャする
mock.module("@/core/sync/engine", () => ({
  syncPush: mock(
    async (_client: unknown, _writer: unknown, _dir: string, _project: string, title: string) => {
      capturedPushTitles.push(title)
      return { committed: true, status: "pushed", newCommitId: "テストコミットID" }
    },
  ),
}))

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

async function runPush(args: Record<string, unknown>) {
  await (
    syncPushCommand.run as (ctx: {
      args: unknown
      cmd: never
      rawArgs: string[]
    }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

function defaultArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: undefined,
    all: false,
    dir: undefined,
    format: "txt",
    retries: "0",
    project: "テストプロジェクト",
    profile: undefined,
    json: false,
    plain: false,
    "results-only": false,
    select: undefined,
    "dry-run": false,
    "enable-commands": undefined,
    "disable-commands": undefined,
    verbose: undefined,
    quiet: false,
    ...overrides,
  }
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  // requireSid のキーチェーン呼び出しをスキップするためダミー SID を設定する
  process.env["COS_SID"] = "s%3Atest-session-id"
  // 各テスト前にキャプチャを初期化する
  capturedPushTitles.length = 0
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("syncPushCommand バリデーション", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runPush(defaultArgs({ project: undefined }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("title も --all も未指定の場合は exit 5 で終了する (TARGET_REQUIRED)", async () => {
    try {
      await runPush(defaultArgs({ title: undefined, all: false, dir: "/tmp/sync" }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--dir も config.sync.dir も未設定の場合は exit 5 で終了する", async () => {
    try {
      await runPush(defaultArgs({ title: "テストページ", dir: undefined }))
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("sandbox で sync.push が禁止されている場合は exit 7 で終了する", async () => {
    try {
      await runPush(
        defaultArgs({
          title: "テストページ",
          dir: "/tmp/sync",
          "enable-commands": "page",
        }),
      )
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})

describe("syncPushCommand --all モード 不正ファイル名スキップ (issue #91)", () => {
  it("Windows 予約名 (CON) のメタファイルはスキップされ、正常なファイルだけ push される", async () => {
    // Given: readdirSync が ["CON.json", "正常なページ.json"] を返す (mock.module で設定済み)
    // When: --all で push する
    await runPush(
      defaultArgs({
        all: true,
        dir: "/tmp/cos-test-sync",
      }),
    )

    // Then: syncPush は "正常なページ" に対してのみ呼ばれること
    expect(capturedPushTitles).toEqual(["正常なページ"])
  })

  it("Windows 予約名スキップ時に警告メッセージが stderr に出力される", async () => {
    await runPush(
      defaultArgs({
        all: true,
        dir: "/tmp/cos-test-sync",
      }),
    )

    // 警告メッセージに不正ファイル名 CON.json が含まれること
    const stderrOutput = stderrMock.mock.calls.map((call: unknown[]) => call[0] as string).join("")
    expect(stderrOutput).toContain("CON.json")
  })
})
