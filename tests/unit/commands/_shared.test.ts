/**
 * _shared.test.ts — commonArgs / dryRunArg のフラグ分離を表明するテスト。
 *
 * 読み取り系コマンドは commonArgs のみを使用し --dry-run を含まない。
 * 書き込み系コマンドは commonArgs に加えて dryRunArg をスプレッドし --dry-run を持つ。
 */

import { describe, expect, it } from "bun:test"
import { commonArgs, dryRunArg, isStdinPath } from "@/commands/_shared"

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

describe("isStdinPath", () => {
  it('"-" はstdinパスとして認識される', () => {
    // cos page new --from-file - のように明示的に - を渡したケース
    expect(isStdinPath("-")).toBe(true)
  })

  it('"" (空文字) はstdinパスとして認識される (citty が --from-file - を空文字に変換するバグへの対応)', () => {
    // citty のパースバグで --from-file - が "" として渡されるケース
    expect(isStdinPath("")).toBe(true)
  })

  it('"somefile.txt" はstdinパスとして認識されない', () => {
    expect(isStdinPath("somefile.txt")).toBe(false)
  })

  it('"/tmp/content.txt" はstdinパスとして認識されない', () => {
    expect(isStdinPath("/tmp/content.txt")).toBe(false)
  })

  it("undefined はstdinパスとして認識されない", () => {
    expect(isStdinPath(undefined)).toBe(false)
  })
})
