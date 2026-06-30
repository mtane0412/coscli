/**
 * _deprecation.test.ts — warnDeprecated ヘルパーのテスト。
 *
 * stderr への出力、COS_SILENCE_DEPRECATION による抑制、
 * warnings 配列への追加を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { DEPRECATION_SINCE, warnDeprecated } from "@/commands/_deprecation"

let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_SILENCE_DEPRECATION")
})

afterEach(() => {
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "COS_SILENCE_DEPRECATION")
})

describe("warnDeprecated", () => {
  it("stderr に [deprecated] メッセージを出力する", () => {
    warnDeprecated("page text", "page get --format=text")
    const output = (stderrMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(output).toContain("[deprecated]")
    expect(output).toContain("page text")
    expect(output).toContain("page get --format=text")
  })

  it("メッセージが改行で終わる", () => {
    warnDeprecated("page text", "page get --format=text")
    const output = (stderrMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(output.endsWith("\n")).toBe(true)
  })

  it("warnings 配列に警告メッセージを追加する", () => {
    const warnings: string[] = []
    warnDeprecated("page text", "page get --format=text", warnings)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("page text")
    expect(warnings[0]).toContain("page get --format=text")
  })

  it("warnings を省略しても stderr には出力される", () => {
    // warnings なし (undefined) でも stderr には出力する
    warnDeprecated("page text", "page get --format=text")
    expect(stderrMock).toHaveBeenCalled()
  })

  describe("COS_SILENCE_DEPRECATION=1 のとき", () => {
    beforeEach(() => {
      process.env["COS_SILENCE_DEPRECATION"] = "1"
    })

    it("stderr に何も出力しない", () => {
      warnDeprecated("page text", "page get --format=text")
      expect(stderrMock).not.toHaveBeenCalled()
    })

    it("warnings 配列にも追加しない", () => {
      const warnings: string[] = []
      warnDeprecated("page text", "page get --format=text", warnings)
      expect(warnings).toHaveLength(0)
    })
  })
})

describe("DEPRECATION_SINCE", () => {
  it("バージョン文字列が定義されている", () => {
    expect(typeof DEPRECATION_SINCE).toBe("string")
    expect(DEPRECATION_SINCE).toMatch(/^v\d+\.\d+/)
  })
})
