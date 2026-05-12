/**
 * args.test.ts — normalizeRootStringFlags のユニットテスト。
 *
 * citty がスペース区切りの string 型フラグ値をサブコマンドと誤認識する問題を
 * プリプロセスで回避する関数の動作を検証する。
 */

import { describe, expect, it } from "bun:test"
import { ROOT_STRING_FLAGS, normalizeRootStringFlags } from "@/infra/args"

describe("normalizeRootStringFlags", () => {
  describe("スペース区切りの値を = 形式に変換する", () => {
    it("--color never auth whoami → --color=never auth whoami", () => {
      const result = normalizeRootStringFlags(
        ["--color", "never", "auth", "whoami"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--color=never", "auth", "whoami"])
    })

    it("--enable-commands page.list page list → --enable-commands=page.list page list", () => {
      const result = normalizeRootStringFlags(
        ["--enable-commands", "page.list", "page", "list"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--enable-commands=page.list", "page", "list"])
    })

    it("--disable-commands page.delete page delete → --disable-commands=page.delete page delete", () => {
      const result = normalizeRootStringFlags(
        ["--disable-commands", "page.delete", "page", "delete", "-p", "sandbox", "タイトル"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual([
        "--disable-commands=page.delete",
        "page",
        "delete",
        "-p",
        "sandbox",
        "タイトル",
      ])
    })

    it("複数の string フラグが連続する場合も正しく変換する", () => {
      const result = normalizeRootStringFlags(
        ["--enable-commands", "page.list", "--color", "never", "page", "list"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--enable-commands=page.list", "--color=never", "page", "list"])
    })

    it("値に空白を含む場合 (シェルがクォート処理した結果) も変換する", () => {
      // シェルの `--color "never ever"` は ["--color", "never ever"] として届く
      const result = normalizeRootStringFlags(
        ["--color", "never ever", "auth", "whoami"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--color=never ever", "auth", "whoami"])
    })

    it("値に = を含む場合も先頭の = のみを区切りとして変換する", () => {
      // --enable-commands=page.get=extra は "--enable-commands=page.get=extra" 形式になる
      const result = normalizeRootStringFlags(
        ["--enable-commands", "page.get=extra", "page", "get"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--enable-commands=page.get=extra", "page", "get"])
    })
  })

  describe("すでに = 形式のフラグは変換しない", () => {
    it("--color=never は変更しない", () => {
      const result = normalizeRootStringFlags(
        ["--color=never", "auth", "whoami"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--color=never", "auth", "whoami"])
    })

    it("--enable-commands=page.list は変更しない", () => {
      const result = normalizeRootStringFlags(
        ["--enable-commands=page.list", "page", "list"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--enable-commands=page.list", "page", "list"])
    })
  })

  describe("次トークンが - で始まる場合は値として消費しない", () => {
    it("--color --json のように次が別フラグならそのまま残す", () => {
      const result = normalizeRootStringFlags(
        ["--color", "--json", "auth", "whoami"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--color", "--json", "auth", "whoami"])
    })

    it("-- セパレーター前のフラグは変換し、-- 以降はそのまま維持する", () => {
      // --color never は変換し、-- 以降はそのまま維持する
      const result = normalizeRootStringFlags(
        ["--color", "never", "--", "--json"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--color=never", "--", "--json"])
    })

    it("-- セパレーター後に ROOT_STRING_FLAGS と同名トークンが来ても変換しない", () => {
      // POSIX: -- 以降はすべてフラグではなく位置引数として扱う
      const result = normalizeRootStringFlags(["--", "--color", "never"], ROOT_STRING_FLAGS)
      expect(result).toEqual(["--", "--color", "never"])
    })

    it("-- セパレーター後の --enable-commands も変換しない", () => {
      const result = normalizeRootStringFlags(
        ["--", "--enable-commands", "page.list"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--", "--enable-commands", "page.list"])
    })
  })

  describe("フラグが末尾で値がない場合は変換しない", () => {
    it("--color のみ (次トークンなし) はそのまま残す", () => {
      const result = normalizeRootStringFlags(["--color"], ROOT_STRING_FLAGS)
      expect(result).toEqual(["--color"])
    })
  })

  describe("string フラグが含まれない場合は変換しない", () => {
    it("auth whoami はそのまま", () => {
      const result = normalizeRootStringFlags(["auth", "whoami"], ROOT_STRING_FLAGS)
      expect(result).toEqual(["auth", "whoami"])
    })

    it("空配列はそのまま", () => {
      const result = normalizeRootStringFlags([], ROOT_STRING_FLAGS)
      expect(result).toEqual([])
    })
  })

  describe("指定した stringFlags にないフラグは変換しない", () => {
    it("--project はリストにないのでスペース区切りのまま残す", () => {
      // --project は各サブコマンドで定義されており ROOT_STRING_FLAGS に含まない
      const result = normalizeRootStringFlags(
        ["--project", "sandbox", "page", "list"],
        ROOT_STRING_FLAGS,
      )
      expect(result).toEqual(["--project", "sandbox", "page", "list"])
    })
  })
})
