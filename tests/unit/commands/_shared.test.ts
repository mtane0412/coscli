/**
 * _shared.test.ts — commonArgs / dryRunArg のフラグ分離を表明するテスト。
 *
 * 読み取り系コマンドは commonArgs のみを使用し --dry-run を含まない。
 * 書き込み系コマンドは commonArgs に加えて dryRunArg をスプレッドし --dry-run を持つ。
 */

import { afterEach, describe, expect, it, spyOn } from "bun:test"
import {
  type CommonArgs,
  buildJsonOpts,
  buildLogger,
  commonArgs,
  dryRunArg,
  getRawFlagValue,
  isStdinPath,
} from "@/commands/_shared"

/** テスト用デフォルト CommonArgs を生成するヘルパー */
function makeArgs(overrides: Partial<CommonArgs> = {}): CommonArgs {
  return {
    json: false,
    plain: false,
    "results-only": false,
    quiet: false,
    ...overrides,
  }
}

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

describe("buildLogger - 環境変数伝播 (COS_JSON / COS_PLAIN)", () => {
  afterEach(() => {
    process.env["COS_JSON"] = undefined
    process.env["COS_PLAIN"] = undefined
  })

  it("COS_JSON=1 が設定されている場合、args.json=false でも info() を stderr へ出力しない (json モード)", () => {
    // cos --json page list のように、ルートフラグから COS_JSON=1 が伝播するケース
    process.env["COS_JSON"] = "1"
    const logger = buildLogger(makeArgs({ json: false }))
    const writeSpy = spyOn(process.stderr, "write").mockImplementation(() => true)
    logger.info("テスト出力")
    expect(writeSpy).not.toHaveBeenCalled()
    writeSpy.mockRestore()
  })

  it("COS_PLAIN=1 が設定されている場合、args.plain=false でも info() を stderr へ出力しない (plain モード)", () => {
    // cos --plain page list のように、ルートフラグから COS_PLAIN=1 が伝播するケース
    process.env["COS_PLAIN"] = "1"
    const logger = buildLogger(makeArgs({ plain: false }))
    const writeSpy = spyOn(process.stderr, "write").mockImplementation(() => true)
    logger.info("テスト出力")
    expect(writeSpy).not.toHaveBeenCalled()
    writeSpy.mockRestore()
  })

  it("環境変数が未設定かつ args.json=false の場合、info() を stderr へ出力する (通常モード)", () => {
    // 環境変数もフラグも指定されていない場合は通常通り出力する
    const logger = buildLogger(makeArgs({ json: false }))
    const writeSpy = spyOn(process.stderr, "write").mockImplementation(() => true)
    logger.info("テスト出力")
    expect(writeSpy).toHaveBeenCalled()
    writeSpy.mockRestore()
  })
})

describe("buildJsonOpts - 環境変数伝播 (COS_RESULTS_ONLY / COS_SELECT)", () => {
  afterEach(() => {
    process.env["COS_RESULTS_ONLY"] = undefined
    process.env["COS_SELECT"] = undefined
  })

  it("COS_RESULTS_ONLY=1 が設定されている場合、args['results-only']=false でも resultsOnly が true になる", () => {
    // cos --results-only page list のように、ルートフラグから伝播するケース
    process.env["COS_RESULTS_ONLY"] = "1"
    const opts = buildJsonOpts(makeArgs({ "results-only": false }))
    expect(opts.resultsOnly).toBe(true)
  })

  it("COS_SELECT が設定されている場合、args.select が未指定でも select が適用される", () => {
    // cos --select 'pages[].title' page list のように、ルートフラグから伝播するケース
    process.env["COS_SELECT"] = "pages[].title"
    const opts = buildJsonOpts(makeArgs())
    expect(opts.select).toBe("pages[].title")
  })

  it("args.select と COS_SELECT の両方が設定されている場合、args.select が優先される", () => {
    // サブコマンドレベルのフラグはルートフラグより優先する
    process.env["COS_SELECT"] = "pages[].title"
    const opts = buildJsonOpts(makeArgs({ select: "pages[].id" }))
    expect(opts.select).toBe("pages[].id")
  })

  it("環境変数が未設定かつ args['results-only']=false の場合、resultsOnly が false のまま", () => {
    // 環境変数もフラグも指定されていない場合は既定値を維持する
    const opts = buildJsonOpts(makeArgs())
    expect(opts.resultsOnly).toBe(false)
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
