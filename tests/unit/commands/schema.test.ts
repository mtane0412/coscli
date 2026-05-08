/**
 * schema.test.ts — `cos schema` コマンドのテスト。
 *
 * JSON 出力・パス指定・alias グルーピング・未知コマンドのエラーを検証する。
 * ルートコマンドは cli-root singleton にテスト用のダミーを注入して使用する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { schemaCommand } from "@/commands/schema"
import { setRootCommand } from "@/core/cli-root"
import type { CommandDef } from "citty"

/** テスト用の list コマンド（list / ls で alias 共有） */
const testListCommand: CommandDef = {
  meta: { name: "list", description: "ページ一覧を取得する" },
  args: {
    project: { type: "string", description: "プロジェクト名", alias: "p" },
    json: { type: "boolean", alias: ["J"], default: false },
  },
}

/** テスト用の auth コマンドグループ */
const testAuthCommand: CommandDef = {
  meta: { name: "auth", description: "認証コマンド" },
  args: {},
  subCommands: {
    login: { meta: { name: "login", description: "ログインする" }, args: {} },
  },
}

/** テスト用のページコマンドグループ */
const testPageCommand: CommandDef = {
  meta: { name: "page", description: "ページ操作コマンド" },
  args: {},
  subCommands: {
    list: testListCommand,
    ls: testListCommand, // alias
  },
}

/** テスト用のルートコマンド */
const testRoot: CommandDef = {
  meta: { name: "cos", version: "test", description: "テスト用ルートコマンド" },
  args: {
    color: { type: "string", default: "auto" },
  },
  subCommands: {
    page: testPageCommand,
    auth: testAuthCommand,
  },
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

/** テスト用の共通引数ヘルパー */
function makeArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _: [],
    json: false,
    plain: false,
    "results-only": false,
    select: undefined,
    "dry-run": false,
    "enable-commands": undefined,
    "disable-commands": undefined,
    verbose: undefined,
    quiet: false,
    profile: undefined,
    project: undefined,
    ...overrides,
  }
}

async function runSchema(args: Record<string, unknown>): Promise<void> {
  await (
    schemaCommand.run as (ctx: {
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

/** stdout に書き出された文字列を結合して返す */
function captureStdout(): string {
  return (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
}

/** process.exit モック後の継続 throw を握り潰してコマンドを実行する */
async function runAndIgnoreExit(args: Record<string, unknown>): Promise<void> {
  try {
    await runSchema(args)
  } catch {
    // process.exit モック後の継続による throw は想定内
  }
}

beforeEach(() => {
  setRootCommand(testRoot, true)
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

describe("schemaCommand", () => {
  describe("全体スキーマ出力（パス指定なし）", () => {
    it("JSON 出力でルートの name が 'cos' である", async () => {
      await runSchema(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.data?.name ?? parsed.name).toBe("cos")
    })

    it("subCommands に page / auth が含まれる", async () => {
      await runSchema(makeArgs({ json: true, "results-only": true }))
      const out = captureStdout()
      const schema = JSON.parse(out)
      const names = schema.subCommands.map((c: { name: string }) => c.name)
      expect(names).toContain("page")
      expect(names).toContain("auth")
    })

    it("list コマンドが aliases: ['ls'] を持つ", async () => {
      await runSchema(makeArgs({ json: true, "results-only": true }))
      const out = captureStdout()
      const schema = JSON.parse(out)
      const pageCmd = schema.subCommands.find((c: { name: string }) => c.name === "page")
      const listCmd = pageCmd?.subCommands.find((c: { name: string }) => c.name === "list")
      expect(listCmd?.aliases).toContain("ls")
    })

    it("--results-only で envelope なし配列（オブジェクト）を直接出力する", async () => {
      await runSchema(makeArgs({ json: true, "results-only": true }))
      const out = captureStdout()
      const schema = JSON.parse(out)
      // envelope なしの場合は data プロパティがなく name プロパティがある
      expect(schema).toHaveProperty("name")
      expect(schema).not.toHaveProperty("data")
    })
  })

  describe("パス指定（個別コマンド）", () => {
    it("['page'] で page グループのスキーマを返す", async () => {
      await runSchema(makeArgs({ json: true, "results-only": true, _: ["page"] }))
      const out = captureStdout()
      const schema = JSON.parse(out)
      expect(schema.name).toBe("page")
    })

    it("['page', 'list'] で list コマンドのスキーマを返す", async () => {
      await runSchema(makeArgs({ json: true, "results-only": true, _: ["page", "list"] }))
      const out = captureStdout()
      const schema = JSON.parse(out)
      expect(schema.name).toBe("list")
      expect(schema.description).toBe("ページ一覧を取得する")
    })

    it("list スキーマに project フラグが含まれる", async () => {
      await runSchema(makeArgs({ json: true, "results-only": true, _: ["page", "list"] }))
      const out = captureStdout()
      const schema = JSON.parse(out)
      const projectArg = schema.args.find((a: { name: string }) => a.name === "project")
      expect(projectArg).toBeDefined()
      expect(projectArg?.alias).toEqual(["p"])
    })
  })

  describe("デフォルト出力（JSON なし）", () => {
    it("JSON 指定なしでも UNKNOWN_COMMAND エラーを文字列で出力する（未知パス）", async () => {
      await runAndIgnoreExit(makeArgs({ json: false, _: ["page", "unknown"] }))
      const out = captureStdout()
      // JSON 形式のエラー出力になる（writeErrorJson は常に JSON を使う）
      expect(out).toContain("UNKNOWN_COMMAND")
    })
  })

  describe("未知コマンドのエラー処理", () => {
    it("未知コマンドパスで exit 4 を呼ぶ", async () => {
      await runAndIgnoreExit(makeArgs({ json: true, _: ["page", "unknown"] }))
      expect(exitMock).toHaveBeenCalledWith(4)
    })

    it("未知コマンドパスで UNKNOWN_COMMAND エラーを出力する", async () => {
      await runAndIgnoreExit(makeArgs({ json: true, _: ["page", "unknown"] }))
      const out = captureStdout()
      expect(out).toContain("UNKNOWN_COMMAND")
    })

    it("存在しないグループパスで exit 4 を呼ぶ", async () => {
      await runAndIgnoreExit(makeArgs({ json: true, _: ["nonexistent"] }))
      expect(exitMock).toHaveBeenCalledWith(4)
    })
  })
})
