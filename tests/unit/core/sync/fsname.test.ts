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

  describe("Windows 予約デバイス名", () => {
    test("CON は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("CON")).toThrow(FilenameInvalidError)
    })

    test("PRN は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("PRN")).toThrow(FilenameInvalidError)
    })

    test("AUX は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("AUX")).toThrow(FilenameInvalidError)
    })

    test("NUL は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("NUL")).toThrow(FilenameInvalidError)
    })

    test("COM1 は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("COM1")).toThrow(FilenameInvalidError)
    })

    test("COM9 は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("COM9")).toThrow(FilenameInvalidError)
    })

    test("LPT1 は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("LPT1")).toThrow(FilenameInvalidError)
    })

    test("LPT9 は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("LPT9")).toThrow(FilenameInvalidError)
    })

    test("拡張子付き予約名 COM1.txt は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("COM1.txt")).toThrow(FilenameInvalidError)
    })

    test("拡張子付き予約名 NUL.log は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("NUL.log")).toThrow(FilenameInvalidError)
    })

    test("小文字の予約名 con は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("con")).toThrow(FilenameInvalidError)
    })

    test("混在大小文字の予約名 CoM1 は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("CoM1")).toThrow(FilenameInvalidError)
    })

    test("予約名を含む通常名 CONSOLE は通過する", () => {
      expect(safeFsName("CONSOLE")).toBe("CONSOLE")
    })

    test("予約名を含む通常名 NULLポインタ は通過する", () => {
      expect(safeFsName("NULLポインタ")).toBe("NULLポインタ")
    })
  })

  describe("末尾スペース・末尾ピリオド", () => {
    test("末尾スペースのファイル名は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("ファイル名 ")).toThrow(FilenameInvalidError)
    })

    test("末尾ピリオドのファイル名は FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("ファイル名.")).toThrow(FilenameInvalidError)
    })

    test("複数の末尾スペースは FilenameInvalidError を throw する", () => {
      expect(() => safeFsName("ファイル名   ")).toThrow(FilenameInvalidError)
    })

    test("中間のスペースは通過する", () => {
      expect(safeFsName("ファイル 名")).toBe("ファイル 名")
    })

    test("中間のピリオドは通過する", () => {
      expect(safeFsName("ファイル.名")).toBe("ファイル.名")
    })
  })

  test("FilenameInvalidError は title と reason を持つ", () => {
    let caughtErr: unknown
    try {
      safeFsName("invalid/title")
      expect.unreachable("FilenameInvalidError が throw されるべきです")
    } catch (err) {
      caughtErr = err
    }
    expect(caughtErr).toBeInstanceOf(FilenameInvalidError)
    if (caughtErr instanceof FilenameInvalidError) {
      expect(caughtErr.title).toBe("invalid/title")
      expect(typeof caughtErr.reason).toBe("string")
    }
  })
})
