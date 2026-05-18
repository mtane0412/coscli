/**
 * local.test.ts — ローカルファイル本文 IO と sha256 のテスト。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { contentToString, readLocalContent, sha256, writeLocalContent } from "@/core/sync/local"

let testDir: string

beforeEach(() => {
  // 各テストに一意な一時ディレクトリを割り当てて並列実行時の競合を防ぐ
  testDir = mkdtempSync(join(tmpdir(), "coscli-local-test-"))
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe("writeLocalContent / readLocalContent", () => {
  test("本文を txt ファイルとして書き込める", () => {
    writeLocalContent(testDir, "テストページ", "txt", ["行A", "行B", "行C"])
    const filePath = join(testDir, "テストページ.txt")
    expect(existsSync(filePath)).toBe(true)

    const content = readFileSync(filePath, "utf-8")
    expect(content).toBe("行A\n行B\n行C\n")
  })

  test("readLocalContent でファイルの行配列を読み込める", () => {
    writeFileSync(join(testDir, "ページA.txt"), "行1\n行2\n行3\n", "utf-8")
    const lines = readLocalContent(testDir, "ページA", "txt")
    expect(lines).toEqual(["行1", "行2", "行3"])
  })

  test("readLocalContent はファイルが存在しない場合 null を返す", () => {
    const result = readLocalContent(testDir, "存在しないページ", "txt")
    expect(result).toBeNull()
  })

  test("空のファイルを書き込んで読み込める", () => {
    writeLocalContent(testDir, "空ページ", "txt", [])
    const lines = readLocalContent(testDir, "空ページ", "txt")
    expect(lines).toEqual([])
  })

  test("末尾の空行は除去される", () => {
    writeFileSync(join(testDir, "ページB.txt"), "行1\n行2\n\n", "utf-8")
    const lines = readLocalContent(testDir, "ページB", "txt")
    // 末尾の空行は除去されて ["行1", "行2"] になる
    expect(lines).toEqual(["行1", "行2"])
  })
})

describe("sha256", () => {
  test("文字列の sha256 ハッシュを返す", () => {
    const hash = sha256("行A\n行B\n行C\n")
    expect(typeof hash).toBe("string")
    expect(hash).toHaveLength(64) // hex 64文字
  })

  test("同じ内容は同じハッシュを返す", () => {
    const a = sha256("テストコンテンツ")
    const b = sha256("テストコンテンツ")
    expect(a).toBe(b)
  })

  test("異なる内容は異なるハッシュを返す", () => {
    const a = sha256("コンテンツA")
    const b = sha256("コンテンツB")
    expect(a).not.toBe(b)
  })
})

describe("contentToString", () => {
  test("行配列を改行区切り文字列に変換する", () => {
    expect(contentToString(["行A", "行B"])).toBe("行A\n行B\n")
  })

  test("空配列は空文字列になる", () => {
    expect(contentToString([])).toBe("")
  })
})

describe("localFilePath", () => {
  test("writeLocalContent はタイトルにファイル名を使う", () => {
    writeLocalContent(testDir, "マイページ", "txt", ["行1"])
    expect(existsSync(join(testDir, "マイページ.txt"))).toBe(true)
  })
})
