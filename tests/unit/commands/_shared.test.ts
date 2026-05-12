/**
 * _shared.test.ts — commonArgs / dryRunArg のフラグ分離を表明するテスト。
 *
 * 読み取り系コマンドは commonArgs のみを使用し --dry-run を含まない。
 * 書き込み系コマンドは commonArgs に加えて dryRunArg をスプレッドし --dry-run を持つ。
 */

import { describe, expect, it } from "bun:test"
import { commonArgs, dryRunArg, getRawFlagValue, isStdinPath } from "@/commands/_shared"

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

describe("getRawFlagValue", () => {
  it('"--after -1" 形式でフラグ直後の負値を取得できる', () => {
    // citty が --after -1 を "" に変換するバグへの回避策として process.argv から実値を取得する
    expect(getRawFlagValue(["node", "cos", "--after", "-1"], "after")).toBe("-1")
  })

  it('"--after=5" 形式でイコール区切りの値を取得できる', () => {
    expect(getRawFlagValue(["node", "cos", "--after=5"], "after")).toBe("5")
  })

  it("対象フラグが存在しない場合は undefined を返す", () => {
    expect(getRawFlagValue(["node", "cos", "--other", "value"], "after")).toBe(undefined)
  })

  it("argv が空の場合は undefined を返す", () => {
    expect(getRawFlagValue([], "after")).toBe(undefined)
  })

  it('"--after" の後に続く要素がない場合は undefined を返す', () => {
    // フラグだけで値がない不完全な argv
    expect(getRawFlagValue(["node", "cos", "--after"], "after")).toBe(undefined)
  })

  it("同一フラグが複数回指定された場合は最後の値を返す (CLI の一般的な挙動に合わせる)", () => {
    // --after 3 --after -1 のように複数回指定された場合、最後の -1 が優先される
    expect(getRawFlagValue(["node", "cos", "--after", "3", "--after", "-1"], "after")).toBe("-1")
  })
})
