/**
 * _shared.test.ts — commonArgs / dryRunArg のフラグ分離を表明するテスト。
 *
 * 読み取り系コマンドは commonArgs のみを使用し --dry-run を含まない。
 * 書き込み系コマンドは commonArgs に加えて dryRunArg をスプレッドし --dry-run を持つ。
 */

import { afterEach, describe, expect, it, spyOn } from "bun:test"
import {
  type CommonArgs,
  ServiceAccountKeyValidationError,
  SidValidationError,
  assertValidServiceAccountKey,
  assertValidSid,
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
    Reflect.deleteProperty(process.env, "COS_JSON")
    Reflect.deleteProperty(process.env, "COS_PLAIN")
  })

  it("COS_JSON=1 が設定されている場合、args.json=false でも info() を stderr へ出力しない (json モード)", () => {
    // cos --json page list のように、ルートフラグから COS_JSON=1 が伝播するケース
    process.env["COS_JSON"] = "1"
    const logger = buildLogger(makeArgs({ json: false }))
    const writeSpy = spyOn(process.stderr, "write").mockImplementation(() => true)
    try {
      logger.info("テスト出力")
      expect(writeSpy).not.toHaveBeenCalled()
    } finally {
      writeSpy.mockRestore()
    }
  })

  it("COS_PLAIN=1 が設定されている場合、args.plain=false でも info() を stderr へ出力しない (plain モード)", () => {
    // cos --plain page list のように、ルートフラグから COS_PLAIN=1 が伝播するケース
    process.env["COS_PLAIN"] = "1"
    const logger = buildLogger(makeArgs({ plain: false }))
    const writeSpy = spyOn(process.stderr, "write").mockImplementation(() => true)
    try {
      logger.info("テスト出力")
      expect(writeSpy).not.toHaveBeenCalled()
    } finally {
      writeSpy.mockRestore()
    }
  })

  it("環境変数が未設定かつ args.json=false の場合、info() を stderr へ出力する (通常モード)", () => {
    // 環境変数もフラグも指定されていない場合は通常通り出力する
    const logger = buildLogger(makeArgs({ json: false }))
    const writeSpy = spyOn(process.stderr, "write").mockImplementation(() => true)
    try {
      logger.info("テスト出力")
      expect(writeSpy).toHaveBeenCalled()
    } finally {
      writeSpy.mockRestore()
    }
  })
})

describe("buildJsonOpts - 環境変数伝播 (COS_RESULTS_ONLY / COS_SELECT)", () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, "COS_RESULTS_ONLY")
    Reflect.deleteProperty(process.env, "COS_SELECT")
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

describe("assertValidSid / SidValidationError", () => {
  it("正常な SID は検証を通過する", () => {
    expect(() => assertValidSid("s%3Atest-session-id.xyz")).not.toThrow()
  })

  it("英数字と記号のみの SID は検証を通過する", () => {
    expect(() => assertValidSid("abc123XYZ!#$%&'*+-.^_`|~")).not.toThrow()
  })

  it("1 文字の SID は検証を通過する", () => {
    expect(() => assertValidSid("a")).not.toThrow()
  })

  it("4096 文字ちょうどの SID は検証を通過する", () => {
    expect(() => assertValidSid("a".repeat(4096))).not.toThrow()
  })

  it("空文字列は SidValidationError をスローする", () => {
    expect(() => assertValidSid("")).toThrow(SidValidationError)
  })

  it("4097 文字の SID は SidValidationError をスローする", () => {
    expect(() => assertValidSid("a".repeat(4097))).toThrow(SidValidationError)
  })

  it("CR (\\r) を含む SID は SidValidationError をスローする", () => {
    expect(() => assertValidSid("valid-sid\r\n")).toThrow(SidValidationError)
  })

  it("LF (\\n) のみを含む SID は SidValidationError をスローする", () => {
    expect(() => assertValidSid("valid-sid\n")).toThrow(SidValidationError)
  })

  it("NUL バイト (\\x00) を含む SID は SidValidationError をスローする", () => {
    expect(() => assertValidSid("valid\x00sid")).toThrow(SidValidationError)
  })

  it("スペースを含む SID は SidValidationError をスローする", () => {
    expect(() => assertValidSid("valid sid")).toThrow(SidValidationError)
  })

  it("ダブルクォートを含む SID は SidValidationError をスローする", () => {
    expect(() => assertValidSid('valid"sid')).toThrow(SidValidationError)
  })

  it("セミコロン (;) を含む SID は SidValidationError をスローする (RFC 6265 cookie-octet 違反)", () => {
    // connect.sid=value;Path=/ のようなヘッダー区切り文字はSIDとして無効
    expect(() => assertValidSid("valid;sid")).toThrow(SidValidationError)
  })

  it("カンマ (,) を含む SID は SidValidationError をスローする (RFC 6265 cookie-octet 違反)", () => {
    // カンマはCookieヘッダーの区切り文字として使われるためSIDとして無効
    expect(() => assertValidSid("valid,sid")).toThrow(SidValidationError)
  })

  it("バックスラッシュ (\\\\) を含む SID は SidValidationError をスローする (RFC 6265 cookie-octet 違反)", () => {
    // バックスラッシュはCookieヘッダーの値として無効
    expect(() => assertValidSid("valid\\sid")).toThrow(SidValidationError)
  })

  it("SidValidationError は Error を継承し SID に関するメッセージを持つ", () => {
    const err = new SidValidationError()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("SidValidationError")
    expect(err.message).toContain("SID")
  })
})

describe("assertValidServiceAccountKey / ServiceAccountKeyValidationError", () => {
  // cs_ + 64桁16進数の有効なキー
  const VALID_SA_KEY = "cs_0000000000000000000000000000000000000000000000000000000000000001"

  it("正常な Service Account キーは検証を通過する", () => {
    expect(() => assertValidServiceAccountKey(VALID_SA_KEY)).not.toThrow()
  })

  it("実際の形式 (cs_ + 64桁小文字16進数) のキーは検証を通過する", () => {
    const key = "cs_8487a04cdd0be210bb369e76dc8ccfdba0c994c17ad37dd39a7bf3d05cd6046e"
    expect(() => assertValidServiceAccountKey(key)).not.toThrow()
  })

  it("空文字列は ServiceAccountKeyValidationError をスローする", () => {
    expect(() => assertValidServiceAccountKey("")).toThrow(ServiceAccountKeyValidationError)
  })

  it("cs_ プレフィックスがない場合は ServiceAccountKeyValidationError をスローする", () => {
    const keyWithoutPrefix = "0000000000000000000000000000000000000000000000000000000000000001"
    expect(() => assertValidServiceAccountKey(keyWithoutPrefix)).toThrow(
      ServiceAccountKeyValidationError,
    )
  })

  it("64桁より短い16進数は ServiceAccountKeyValidationError をスローする", () => {
    const shortKey = "cs_000000000000000000000000000000000000000000000000000000000000001"
    expect(() => assertValidServiceAccountKey(shortKey)).toThrow(ServiceAccountKeyValidationError)
  })

  it("64桁より長い16進数は ServiceAccountKeyValidationError をスローする", () => {
    const longKey = "cs_00000000000000000000000000000000000000000000000000000000000000001"
    expect(() => assertValidServiceAccountKey(longKey)).toThrow(ServiceAccountKeyValidationError)
  })

  it("大文字16進数を含む場合は ServiceAccountKeyValidationError をスローする", () => {
    const upperKey = "cs_0000000000000000000000000000000000000000000000000000000000000001".replace(
      "0001",
      "000A",
    )
    expect(() => assertValidServiceAccountKey(upperKey)).toThrow(ServiceAccountKeyValidationError)
  })

  it("ServiceAccountKeyValidationError は Error を継承し分かりやすいメッセージを持つ", () => {
    const err = new ServiceAccountKeyValidationError()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("ServiceAccountKeyValidationError")
    expect(err.message).toContain("cs_")
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
