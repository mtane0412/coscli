/**
 * exit-codes.test.ts — `cos exit-codes` コマンドのテスト。
 *
 * JSON / plain / --results-only / --select の出力形式と終了コード 0 を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { exitCodesCommand } from "@/commands/exit-codes"
import { EXIT_CODES } from "@/core/exit-codes"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

/** テスト用の共通引数ヘルパー */
function makeArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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

async function runExitCodes(args: Record<string, unknown>): Promise<void> {
  await (
    exitCodesCommand.run as (ctx: {
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

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

describe("exitCodesCommand", () => {
  describe("--json オプション", () => {
    it("envelope 形式で終了コード配列を出力する", async () => {
      await runExitCodes(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed).toHaveProperty("data")
      expect(Array.isArray(parsed.data)).toBe(true)
    })

    it("配列の長さが EXIT_CODES.length と一致する", async () => {
      await runExitCodes(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.data).toHaveLength(EXIT_CODES.length)
    })

    it("code: 124 (timeout) が含まれる", async () => {
      await runExitCodes(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      const codes: number[] = parsed.data.map((e: { code: number }) => e.code)
      expect(codes).toContain(124)
    })

    it("各エントリに code / name / description が含まれる", async () => {
      await runExitCodes(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      for (const entry of parsed.data) {
        expect(typeof entry.code).toBe("number")
        expect(typeof entry.name).toBe("string")
        expect(typeof entry.description).toBe("string")
      }
    })

    it("meta フィールドに command: 'exit-codes' が含まれる", async () => {
      await runExitCodes(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.meta?.command).toBe("exit-codes")
    })
  })

  describe("--json --results-only オプション", () => {
    it("envelope なしで配列を直接出力する", async () => {
      await runExitCodes(makeArgs({ json: true, "results-only": true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      // envelope 形式の場合は data プロパティがある、配列直接の場合はない
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(EXIT_CODES.length)
    })
  })

  describe("--json --select オプション", () => {
    it("'[].code' で code 配列のみ出力する", async () => {
      await runExitCodes(makeArgs({ json: true, select: "[].code" }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toContain(0)
      expect(parsed).toContain(124)
      // オブジェクトでなく数値のみ
      for (const item of parsed) {
        expect(typeof item).toBe("number")
      }
    })
  })

  describe("デフォルト出力（テーブル形式）", () => {
    it("code / name / description のヘッダを含む", async () => {
      await runExitCodes(makeArgs())
      const out = captureStdout()
      expect(out).toContain("code")
      expect(out).toContain("name")
      expect(out).toContain("description")
    })

    it("終了コード 'success' の行を含む", async () => {
      await runExitCodes(makeArgs())
      const out = captureStdout()
      expect(out).toContain("success")
    })

    it("timeout の行を含む", async () => {
      await runExitCodes(makeArgs())
      const out = captureStdout()
      expect(out).toContain("timeout")
    })
  })

  describe("--plain オプション", () => {
    it("TSV 形式で出力する（ヘッダ行あり）", async () => {
      await runExitCodes(makeArgs({ plain: true }))
      const out = captureStdout()
      // TSV はタブ区切り
      expect(out).toContain("\t")
      expect(out).toContain("code")
    })
  })

  describe("正常終了", () => {
    it("process.exit を呼ばず正常終了する", async () => {
      await runExitCodes(makeArgs({ json: true }))
      expect(exitMock).not.toHaveBeenCalled()
    })
  })
})
