/**
 * plain.test.ts — presenter/plain の単体テスト。
 *
 * cli-table3 を使ったテーブル出力と TSV 出力を検証する。
 * 出力先 stream を差し替えて副作用なしにテストする。
 *
 * writePlainTable は initColor(mode) の設定に従い、
 * never モードでは ANSI コードなし、always モードでは ANSI コードありで出力する。
 */

import { describe, expect, it } from "bun:test"
import { initColor } from "@/infra/color"
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

/** containsAnsi は文字列に ANSI エスケープコード (ESC: 0x1B) が含まれるか判定する。 */
function containsAnsi(s: string): boolean {
  // ESC (0x1B) の文字コードで判定する（正規表現の制御文字を避けるため）
  return s.split("").some((c) => c.charCodeAt(0) === 0x1b)
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

  it("never モードで ANSI コードが含まれない", () => {
    // --color never 時はテーブルの罫線・ヘッダーに ANSI コードが含まれないこと
    initColor("never")
    const stream = createMockStream()
    writePlainTable(["タイトル", "件数"], [["ホームページ", "100"]], {
      stream: stream as unknown as NodeJS.WritableStream,
    })
    expect(containsAnsi(stream.output)).toBe(false)
  })

  it("always モードで ANSI コードが含まれる", () => {
    // --color always 時はテーブルの罫線・ヘッダーに ANSI コードが含まれること
    initColor("always")
    const stream = createMockStream()
    writePlainTable(["タイトル", "件数"], [["ホームページ", "100"]], {
      stream: stream as unknown as NodeJS.WritableStream,
    })
    expect(containsAnsi(stream.output)).toBe(true)
  })

  it("Unicode 罫線文字が出力に含まれない", () => {
    // gogcli 風のスペースパディング整列テキストであり、罫線は描画しないこと
    initColor("never")
    const stream = createMockStream()
    writePlainTable(
      ["名前", "表示名"],
      [
        ["icons", "Icons"],
        ["mtane0412", "mtane0412"],
      ],
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const BORDER_CHARS = ["├", "┤", "┌", "┐", "└", "┘", "─", "│", "┼", "┬", "┴"]
    for (const ch of BORDER_CHARS) {
      expect(stream.output).not.toContain(ch)
    }
  })

  it("スペースパディングで列が整列されている", () => {
    // 各列は最大幅に揃えられ、セル間はスペースで区切られること
    initColor("never")
    const stream = createMockStream()
    writePlainTable(
      ["名前", "値"],
      [
        ["短い", "abc"],
        ["長いキー名前", "xyz"],
      ],
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const lines = stream.output.split("\n").filter((l) => l.trim().length > 0)
    // 全行に「名前」列の最大幅 (「長いキー名前」) が反映されていること
    expect(lines[0]).toContain("名前")
    expect(lines[1]).toContain("短い")
    expect(lines[2]).toContain("長いキー名前")
    // 行間でインデントが揃う (先頭スペースがないこと)
    for (const line of lines) {
      expect(line.startsWith(" ")).toBe(false)
    }
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
