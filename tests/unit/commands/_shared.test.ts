/**
 * _shared.test.ts — commonArgs / dryRunArg のフラグ分離を表明するテスト。
 *
 * 読み取り系コマンドは commonArgs のみを使用し --dry-run を含まない。
 * 書き込み系コマンドは commonArgs に加えて dryRunArg をスプレッドし --dry-run を持つ。
 */

import { describe, expect, it } from "bun:test"
import { commonArgs, dryRunArg } from "@/commands/_shared"

describe("commonArgs", () => {
  it("--dry-run キーを含まない (読み取り専用コマンド向け)", () => {
    expect(Object.keys(commonArgs)).not.toContain("dry-run")
  })

  it("読み取り系共通フラグ (project, json, plain 等) を含む", () => {
    expect(Object.keys(commonArgs)).toContain("project")
    expect(Object.keys(commonArgs)).toContain("json")
    expect(Object.keys(commonArgs)).toContain("plain")
    expect(Object.keys(commonArgs)).toContain("verbose")
    expect(Object.keys(commonArgs)).toContain("quiet")
  })
})

describe("dryRunArg", () => {
  it("--dry-run キーを含む (書き込み系コマンド向け)", () => {
    expect(Object.keys(dryRunArg)).toContain("dry-run")
  })

  it("dry-run フラグのデフォルト値は false", () => {
    expect(dryRunArg["dry-run"].default).toBe(false)
  })
})
