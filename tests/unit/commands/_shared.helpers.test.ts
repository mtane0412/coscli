/**
 * _shared.helpers.test.ts — _shared.ts の readWriteInput / runNotationLint / handleRestError のテスト。
 *
 * readWriteInput のファイル I/O は opts.readStdin / opts.readFile による依存注入でモックし、
 * mock.module を使用しないことで bun:test カバレッジモードの共有プロセス汚染を回避する。
 * runNotationLint は実 lintNotation を使用し、既知の記法違反入力で findings を生成する。
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { handleRestError, readWriteInput, runNotationLint } from "@/commands/_shared"
import { AuthError, ForbiddenError, NotFoundError } from "@/core/api/rest"
import { UnsafePathError } from "@/infra/safe-read"

// ----- セットアップ -----

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

/** stdout への JSON 出力を収集してパースするヘルパー */
function captureJsonOutput(): { error?: { code: string; hint?: string } } {
  const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
  if (!output.trim()) return {}
  return JSON.parse(output) as { error?: { code: string; hint?: string } }
}

// ----- readWriteInput テスト -----

describe("readWriteInput", () => {
  const defaultOpts = {
    requireContentErrorCode: "CONTENT_REQUIRED",
    requireContentMessage: "コンテンツが必要です",
    requireContentHint: "--line または --from-file で指定してください",
  }

  describe("--line フラグ (string)", () => {
    it("実改行 (\\n) で区切られた文字列を行配列に分割する", () => {
      const result = readWriteInput({ line: "行1\n行2\n行3" }, defaultOpts)
      expect(result).toEqual(["行1", "行2", "行3"])
    })

    it("エスケープシーケンス \\\\n で改行を表現できる", () => {
      const result = readWriteInput({ line: "行1\\n行2" }, defaultOpts)
      expect(result).toEqual(["行1", "行2"])
    })

    it("CRLF 改行 (\\r\\n) を正規化して行配列に分割する", () => {
      const result = readWriteInput({ line: "行1\r\n行2\r\n行3" }, defaultOpts)
      expect(result).toEqual(["行1", "行2", "行3"])
    })
  })

  describe("--line フラグ (string[])", () => {
    it("line が配列のとき各要素を展開してフラットな行配列を返す", () => {
      const result = readWriteInput({ line: ["行1\n行2", "行3"] }, defaultOpts)
      expect(result).toEqual(["行1", "行2", "行3"])
    })
  })

  describe("--text フラグ", () => {
    it("text フラグも line 同様に改行分割される", () => {
      const result = readWriteInput({ text: "テキスト行1\nテキスト行2" }, defaultOpts)
      expect(result).toEqual(["テキスト行1", "テキスト行2"])
    })
  })

  describe("stdin 読み込み (opts.readStdin による依存注入)", () => {
    it('--from-file "-" のとき readStdin を呼び出す', () => {
      // 注入した readStdin が実際に呼ばれることを検証する
      const readStdin = mock(() => "stdin行1\nstdin行2")
      const result = readWriteInput({ "from-file": "-" }, { ...defaultOpts, readStdin })
      expect(readStdin).toHaveBeenCalledTimes(1)
      expect(result).toEqual(["stdin行1", "stdin行2"])
    })

    it('--from-file "" (citty バグ対応) のとき readStdin を呼び出す', () => {
      const readStdin = mock(() => "stdin行1\nstdin行2")
      const result = readWriteInput({ "from-file": "" }, { ...defaultOpts, readStdin })
      expect(readStdin).toHaveBeenCalledTimes(1)
      expect(result).toEqual(["stdin行1", "stdin行2"])
    })

    it("末尾改行を含む stdin 内容の最後の空行を除去する", () => {
      // "行1\n行2\n" を split すると ["行1", "行2", ""] になり、最後の空文字を除去する
      const readStdin = mock(() => "行1\n行2\n")
      const result = readWriteInput({ "from-file": "-" }, { ...defaultOpts, readStdin })
      expect(result).toEqual(["行1", "行2"])
    })

    it("stdin からの UnsafePathError は exit 5 / UNSAFE_PATH / hint なし で終了する", () => {
      const readStdin = () => {
        throw new UnsafePathError("/dev/stdin", "stdin からの読み込みはサポートされていません")
      }
      try {
        readWriteInput({ "from-file": "-" }, { ...defaultOpts, readStdin })
      } catch {
        // process.exit モック後の throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      const parsed = captureJsonOutput()
      expect(parsed.error?.code).toBe("UNSAFE_PATH")
      // stdin には --allow-unsafe-read のヒントは表示しない
      expect(parsed.error?.hint).toBeUndefined()
    })
  })

  describe("ファイル読み込み (opts.readFile による依存注入)", () => {
    it("--from-file でファイルパスを指定すると readFile を呼び出す", () => {
      const readFile = mock(
        (_path: string, _opts: { allowUnsafe: boolean }) => "ファイル行1\nファイル行2",
      )
      const result = readWriteInput(
        { "from-file": "/tmp/テスト.txt" },
        { ...defaultOpts, readFile },
      )
      expect(readFile).toHaveBeenCalledWith("/tmp/テスト.txt", { allowUnsafe: false })
      expect(result).toEqual(["ファイル行1", "ファイル行2"])
    })

    it("--allow-unsafe-read フラグが readFile に伝達される", () => {
      const readFile = mock((_path: string, _opts: { allowUnsafe: boolean }) => "内容")
      readWriteInput(
        { "from-file": "/etc/passwd", "allow-unsafe-read": true },
        { ...defaultOpts, readFile },
      )
      expect(readFile).toHaveBeenCalledWith("/etc/passwd", { allowUnsafe: true })
    })

    it("ファイルからの UnsafePathError は exit 5 / UNSAFE_PATH / --allow-unsafe-read ヒント付きで終了する", () => {
      const readFile = (_path: string, _opts: { allowUnsafe: boolean }): string => {
        throw new UnsafePathError("/etc/passwd", "システムファイルへのアクセスは禁止されています")
      }
      try {
        readWriteInput({ "from-file": "/etc/passwd" }, { ...defaultOpts, readFile })
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      const parsed = captureJsonOutput()
      expect(parsed.error?.code).toBe("UNSAFE_PATH")
      // ファイルには --allow-unsafe-read のヒントを表示する
      expect(parsed.error?.hint).toContain("allow-unsafe-read")
    })
  })

  describe("コードブロック内の空行正規化", () => {
    it("stdin からの入力でコードブロック内の空行が ' ' に変換される", () => {
      const readStdin = mock(() => "code:python\n def hello():\n\n     print('hello')")
      const result = readWriteInput({ "from-file": "-" }, { ...defaultOpts, readStdin })
      expect(result).toEqual(["code:python", " def hello():", " ", "     print('hello')"])
    })

    it("ファイルからの入力でコードブロック内の空行が ' ' に変換される", () => {
      const readFile = mock(
        (_path: string, _opts: { allowUnsafe: boolean }) => "code:python\n x = 1\n\n y = 2\n",
      )
      const result = readWriteInput(
        { "from-file": "/tmp/テストコード.py" },
        { ...defaultOpts, readFile },
      )
      expect(result).toEqual(["code:python", " x = 1", " ", " y = 2"])
    })

    it("--line フラグでコードブロック内の空行が ' ' に変換される", () => {
      const result = readWriteInput({ line: "code:python\n x = 1\n\n y = 2" }, defaultOpts)
      expect(result).toEqual(["code:python", " x = 1", " ", " y = 2"])
    })

    it("コードブロック外の空行は変換されない", () => {
      const readStdin = mock(() => "段落1\n\n段落2")
      const result = readWriteInput({ "from-file": "-" }, { ...defaultOpts, readStdin })
      expect(result).toEqual(["段落1", "", "段落2"])
    })
  })

  describe("コンテンツ未指定 / 空", () => {
    it("line も from-file も未指定の場合は exit 5 / requireContentErrorCode で終了する", () => {
      try {
        readWriteInput({}, defaultOpts)
      } catch {
        // 想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      const parsed = captureJsonOutput()
      expect(parsed.error?.code).toBe("CONTENT_REQUIRED")
    })
  })
})

// ----- runNotationLint テスト -----
// 実 lintNotation を使用し、既知の記法違反入力で findings を生成する

describe("runNotationLint", () => {
  const nonStrictArgs = { "strict-notation": false }
  const strictArgs = { "strict-notation": true }

  it("lint 指摘がない場合は空配列を返す", () => {
    // 有効な Cosense 記法のみを含む入力は findings を生成しない
    const result = runNotationLint(["有効な行1", "有効な行2"], nonStrictArgs)
    expect(result).toEqual([])
  })

  it("lint 指摘がある場合は警告文字列配列を返す (non-strict)", () => {
    // [*テキスト] は no-space-in-emphasis ルール違反 (* 直後のスペースなし)
    const result = runNotationLint(["[*テキスト]"], nonStrictArgs)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toContain("no-space-in-emphasis")
  })

  it("lint 指摘がある場合に --strict-notation=true なら exit 5 / NOTATION_LINT で終了する", () => {
    try {
      runNotationLint(["[*テキスト]"], strictArgs)
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    const parsed = captureJsonOutput()
    expect(parsed.error?.code).toBe("NOTATION_LINT")
  })
})

// ----- handleRestError テスト -----

describe("handleRestError", () => {
  const context = { resourceKind: "page" as const, resourceName: "テストページ" }

  it("AuthError の場合は exit 2 で終了する", () => {
    try {
      handleRestError(new AuthError(), context)
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(2)
  })

  it("ForbiddenError の場合は exit 3 で終了する", () => {
    try {
      handleRestError(new ForbiddenError(), context)
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(3)
  })

  it("NotFoundError の場合は exit 4 で終了する", () => {
    try {
      handleRestError(new NotFoundError("テストページ"), context)
    } catch {
      // 想定内
    }
    expect(exitMock).toHaveBeenCalledWith(4)
  })

  it("未知のエラーは何もしない (呼び出し側への再スローに委ねる)", () => {
    // handleRestError 自体は process.exit を呼ばず、ただ return する
    handleRestError(new Error("一般エラー"), context)
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("null は何もしない", () => {
    handleRestError(null, context)
    expect(exitMock).not.toHaveBeenCalled()
  })
})
