/**
 * fsname.test.ts — safeFsName バリデーターのテスト。
 */

import { describe, expect, test } from "bun:test"
import { FilenameInvalidError, safeFsName } from "@/core/sync/fsname"

describe("safeFsName", () => {
  test("通常のタイトルはそのまま返す", () => {
    expect(safeFsName("ハローワールド")).toBe("ハローワールド")
    expect(safeFsName("hello world")).toBe("hello world")
    expect(safeFsName("テスト123")).toBe("テスト123")
    expect(safeFsName("a-b_c.d")).toBe("a-b_c.d")
  })

  test("スペースを含むタイトルはそのまま返す", () => {
    expect(safeFsName("hello world")).toBe("hello world")
  })

  test("ドットのみのタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName(".")).toThrow(FilenameInvalidError)
    expect(() => safeFsName("..")).toThrow(FilenameInvalidError)
  })

  test("空文字は FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("")).toThrow(FilenameInvalidError)
  })

  test("スラッシュを含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("dir/file")).toThrow(FilenameInvalidError)
    expect(() => safeFsName("path/to/page")).toThrow(FilenameInvalidError)
  })

  test("バックスラッシュを含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("dir\\file")).toThrow(FilenameInvalidError)
  })

  test("コロンを含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("C:drive")).toThrow(FilenameInvalidError)
  })

  test("アスタリスクを含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("file*name")).toThrow(FilenameInvalidError)
  })

  test("クエスチョンマークを含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("what?")).toThrow(FilenameInvalidError)
  })

  test("ダブルクォートを含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName('say "hello"')).toThrow(FilenameInvalidError)
  })

  test("不等号を含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("a<b")).toThrow(FilenameInvalidError)
    expect(() => safeFsName("a>b")).toThrow(FilenameInvalidError)
  })

  test("パイプを含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("a|b")).toThrow(FilenameInvalidError)
  })

  test("制御文字を含むタイトルは FilenameInvalidError を throw する", () => {
    expect(() => safeFsName("null\x00char")).toThrow(FilenameInvalidError)
    expect(() => safeFsName("newline\nchar")).toThrow(FilenameInvalidError)
  })

  test("FilenameInvalidError は title と reason を持つ", () => {
    try {
      safeFsName("invalid/title")
    } catch (err) {
      expect(err).toBeInstanceOf(FilenameInvalidError)
      if (err instanceof FilenameInvalidError) {
        expect(err.title).toBe("invalid/title")
        expect(typeof err.reason).toBe("string")
      }
    }
  })
})
