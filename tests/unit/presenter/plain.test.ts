/**
 * plain.test.ts — presenter/plain の単体テスト。
 *
 * cli-table3 を使ったテーブル出力と TSV 出力を検証する。
 * 出力先 stream を差し替えて副作用なしにテストする。
 */

import { describe, expect, it } from "bun:test"
import { writePlainList, writePlainTable, writeTsv } from "@/presenter/plain"

/** WritableStream の代わりに文字列を収集するモックストリーム */
function createMockStream() {
  let buffer = ""
  return {
    write(chunk: string) {
      buffer += chunk
    },
    get output(): string {
      return buffer
    },
  }
}

describe("writePlainTable", () => {
  it("ヘッダーと行データをテーブル形式で出力する", () => {
    const stream = createMockStream()
    writePlainTable(
      ["タイトル", "更新日時"],
      [
        ["ページA", "2024-01-01"],
        ["ページB", "2024-06-15"],
      ],
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    expect(stream.output).toContain("タイトル")
    expect(stream.output).toContain("更新日時")
    expect(stream.output).toContain("ページA")
    expect(stream.output).toContain("ページB")
  })

  it("空のデータでも出力が崩れない", () => {
    const stream = createMockStream()
    writePlainTable(["タイトル", "件数"], [], {
      stream: stream as unknown as NodeJS.WritableStream,
    })
    expect(stream.output).toContain("タイトル")
  })
})

describe("writeTsv", () => {
  it("ヘッダー付きの TSV を出力する", () => {
    const stream = createMockStream()
    writeTsv(
      ["プロジェクト", "ページ数"],
      [
        ["マイプロジェクト", "42"],
        ["別プロジェクト", "10"],
      ],
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const lines = stream.output.split("\n").filter((l) => l.length > 0)
    expect(lines[0]).toBe("プロジェクト\tページ数")
    expect(lines[1]).toBe("マイプロジェクト\t42")
    expect(lines[2]).toBe("別プロジェクト\t10")
  })

  it("noHeader=true の場合はヘッダー行を出力しない", () => {
    const stream = createMockStream()
    writeTsv(["タイトル"], [["ページX"]], {
      stream: stream as unknown as NodeJS.WritableStream,
      noHeader: true,
    })
    const lines = stream.output.split("\n").filter((l) => l.length > 0)
    expect(lines.length).toBe(1)
    expect(lines[0]).toBe("ページX")
  })

  it("タブを含むセル値はエスケープされる", () => {
    const stream = createMockStream()
    writeTsv(["タイトル"], [["タブ\t含む"]], {
      stream: stream as unknown as NodeJS.WritableStream,
      noHeader: true,
    })
    expect(stream.output).toContain("タブ\\t含む")
  })
})

describe("writePlainList", () => {
  it("各要素を1行ずつ出力する", () => {
    const stream = createMockStream()
    writePlainList(["ページA", "ページB", "ページC"], {
      stream: stream as unknown as NodeJS.WritableStream,
    })
    const lines = stream.output.split("\n").filter((l) => l.length > 0)
    expect(lines).toEqual(["ページA", "ページB", "ページC"])
  })

  it("空配列の場合は何も出力しない", () => {
    const stream = createMockStream()
    writePlainList([], { stream: stream as unknown as NodeJS.WritableStream })
    expect(stream.output).toBe("")
  })
})
