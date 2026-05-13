/**
 * notation/guide.test.ts — `cos notation` コマンドのテスト。
 *
 * JSON / plain / テーブル形式の出力と正常終了を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { notationGuideCommand } from "@/commands/notation/guide"
import { NOTATION_GUIDE } from "@/core/notation/guide"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

function makeArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    json: false,
    plain: false,
    "results-only": false,
    select: undefined,
    "enable-commands": undefined,
    "disable-commands": undefined,
    verbose: undefined,
    quiet: false,
    profile: undefined,
    project: undefined,
    ...overrides,
  }
}

async function runNotation(args: Record<string, unknown>): Promise<void> {
  await (
    notationGuideCommand.run as (ctx: {
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

describe("notationGuideCommand", () => {
  describe("--json オプション", () => {
    it("envelope 形式でガイドデータを出力する", async () => {
      await runNotation(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed).toHaveProperty("data")
      expect(parsed.data).toHaveProperty("sections")
      expect(parsed.data).toHaveProperty("tips")
    })

    it("meta フィールドに command: 'notation' が含まれる", async () => {
      await runNotation(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.meta?.command).toBe("notation")
    })

    it("sections の長さが NOTATION_GUIDE.sections.length と一致する", async () => {
      await runNotation(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.data.sections).toHaveLength(NOTATION_GUIDE.sections.length)
    })
  })

  describe("デフォルト出力（テーブル形式）", () => {
    it("syntax / description のヘッダを含む", async () => {
      await runNotation(makeArgs())
      const out = captureStdout()
      expect(out).toContain("syntax")
      expect(out).toContain("description")
    })

    it("Cosense の記法例 ([* 強調] 等) が出力に含まれる", async () => {
      await runNotation(makeArgs())
      const out = captureStdout()
      expect(out).toContain("[*")
    })
  })

  describe("--plain オプション", () => {
    it("TSV 形式で出力する", async () => {
      await runNotation(makeArgs({ plain: true }))
      const out = captureStdout()
      expect(out).toContain("\t")
    })
  })

  describe("正常終了", () => {
    it("process.exit を呼ばず正常終了する", async () => {
      await runNotation(makeArgs({ json: true }))
      expect(exitMock).not.toHaveBeenCalled()
    })
  })
})
