/**
 * convert.test.ts — `cos convert --from=<fmt> --to=<fmt>` コマンドのテスト。
 *
 * stdin/stdout 変換、バリデーション (同一フォーマット、未知フォーマット) を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { convertCommand } from "@/commands/convert"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

async function runConvert(args: Record<string, unknown>) {
  await (
    convertCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
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

describe("convertCommand", () => {
  it("--from=scrapbox --to=md: ファイルから Markdown に変換される", async () => {
    const tmpFile = join(tmpdir(), `cos-test-convert-${Date.now()}.txt`)
    writeFileSync(tmpFile, "テストページ\n[*** 大見出し]\n本文テキスト")
    try {
      await runConvert({
        from: "scrapbox",
        to: "md",
        "from-file": tmpFile,
        "to-file": undefined,
        "bold-style": "auto",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // 想定内
    }
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(calls).toContain("# テストページ")
    expect(calls).toContain("## 大見出し")
    expect(calls).toContain("本文テキスト")
  })

  it("--from=md --to=scrapbox: ファイルから Scrapbox 記法に変換される", async () => {
    const tmpFile = join(tmpdir(), `cos-test-convert-${Date.now()}.md`)
    writeFileSync(tmpFile, "## 大見出し\n本文テキスト")
    try {
      await runConvert({
        from: "md",
        to: "scrapbox",
        "from-file": tmpFile,
        "to-file": undefined,
        "bold-style": "auto",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // 想定内
    }
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(calls).toContain("[*** 大見出し]")
    expect(calls).toContain("本文テキスト")
  })

  it("--from と --to が同じ場合は SAME_FORMAT_ERROR で exit 5", async () => {
    try {
      await runConvert({
        from: "md",
        to: "md",
        "from-file": undefined,
        "to-file": undefined,
        "bold-style": "auto",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("SAME_FORMAT_ERROR"))
  })

  it("--from に未知の値を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    try {
      await runConvert({
        from: "xml",
        to: "md",
        "from-file": undefined,
        "to-file": undefined,
        "bold-style": "auto",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
  })

  it("--to に未知の値を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    try {
      await runConvert({
        from: "scrapbox",
        to: "html",
        "from-file": undefined,
        "to-file": undefined,
        "bold-style": "auto",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
  })

  it("--bold-style に未知の値を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    const tmpFile = join(tmpdir(), `cos-test-convert-${Date.now()}.txt`)
    writeFileSync(tmpFile, "タイトル\n本文")
    try {
      await runConvert({
        from: "scrapbox",
        to: "md",
        "from-file": tmpFile,
        "to-file": undefined,
        "bold-style": "invalid-mode",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
      })
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
  })
})
