/**
 * lint.test.ts — lintNotation() の単体テスト。
 *
 * 4ルール (no-space-in-emphasis / reversed-heading-hierarchy /
 * markdown-bold-residue / markdown-italic-residue) の検出・非検出を網羅する。
 */

import { describe, expect, it } from "bun:test"
import { lintNotation } from "@/core/notation/lint"

// ------
// ヘルパー: 指定 rule の finding だけを返す
// ------
function findingsFor(lines: string[], rule: string) {
  return lintNotation(lines).filter((f) => f.rule === rule)
}

// ==============================
// ルール 1: no-space-in-emphasis
// ==============================
describe("no-space-in-emphasis", () => {
  it("[*テキスト] — * 直後にスペースなし → 検出", () => {
    const findings = findingsFor(["[*テキスト]"], "no-space-in-emphasis")
    expect(findings.length).toBe(1)
    expect(findings[0]?.line).toBe(1)
  })

  it("[**テキスト] — ** 直後にスペースなし → 検出", () => {
    const findings = findingsFor(["[**テキスト]"], "no-space-in-emphasis")
    expect(findings.length).toBe(1)
  })

  it("[***テキスト] — *** 直後にスペースなし → 検出", () => {
    expect(findingsFor(["[***テキスト]"], "no-space-in-emphasis").length).toBe(1)
  })

  it("[****テキスト] — **** 直後にスペースなし → 検出", () => {
    expect(findingsFor(["[****テキスト]"], "no-space-in-emphasis").length).toBe(1)
  })

  it("[-テキスト] — - 直後にスペースなし → 検出", () => {
    expect(findingsFor(["[-テキスト]"], "no-space-in-emphasis").length).toBe(1)
  })

  it("[/テキスト] — / 直後にスペースなし → 検出 (クロスプロジェクトリンク除外)", () => {
    // [/word] はリンクではなく斜体記法のスペース欠落として検出
    expect(findingsFor(["[/テキスト]"], "no-space-in-emphasis").length).toBe(1)
  })

  it("[/project/page] — クロスプロジェクトリンク → 検出しない", () => {
    // スラッシュが2個含まれる場合はクロスプロジェクトリンク
    expect(findingsFor(["[/mtane0412/ページ名]"], "no-space-in-emphasis").length).toBe(0)
  })

  it("[* テキスト] — スペースあり → 検出しない", () => {
    expect(findingsFor(["[* テキスト]"], "no-space-in-emphasis").length).toBe(0)
  })

  it("[** テキスト] — スペースあり → 検出しない", () => {
    expect(findingsFor(["[** テキスト]"], "no-space-in-emphasis").length).toBe(0)
  })

  it("[- テキスト] — スペースあり → 検出しない", () => {
    expect(findingsFor(["[- テキスト]"], "no-space-in-emphasis").length).toBe(0)
  })

  it("[/ テキスト] — スペースあり → 検出しない", () => {
    expect(findingsFor(["[/ テキスト]"], "no-space-in-emphasis").length).toBe(0)
  })

  it("通常のページリンク [ページ名] → 検出しない", () => {
    expect(findingsFor(["[ページ名]"], "no-space-in-emphasis").length).toBe(0)
  })

  it("code: ブロック内の [*foo] → 検出しない", () => {
    const lines = ["code:sample.js", " [*foo]", " const x = 1"]
    expect(findingsFor(lines, "no-space-in-emphasis").length).toBe(0)
  })

  it("インラインコード内の [*foo] → 検出しない", () => {
    // バッククォートで囲まれた範囲内は対象外
    expect(findingsFor(["`[*foo]`"], "no-space-in-emphasis").length).toBe(0)
  })

  it("issue #82 の実例: [*ルール＋幾何] → 検出", () => {
    expect(findingsFor(["[*ルール＋幾何]"], "no-space-in-emphasis").length).toBe(1)
  })

  it("複数行に誤用がある場合、各行の finding を返す", () => {
    const lines = ["[*強調1]", "正常な行", "[**強調2]"]
    const findings = findingsFor(lines, "no-space-in-emphasis")
    expect(findings.length).toBe(2)
    expect(findings[0]?.line).toBe(1)
    expect(findings[1]?.line).toBe(3)
  })
})

// ==============================
// ルール 2: reversed-heading-hierarchy
// ==============================
describe("reversed-heading-hierarchy", () => {
  it("[* h1] → [** h2] の順序 → Markdown 的な逆転を検出", () => {
    // Cosense では * が最小サイズなので逆転している
    const lines = ["[* 章タイトル]", "本文", "[** 節タイトル]"]
    const findings = findingsFor(lines, "reversed-heading-hierarchy")
    expect(findings.length).toBeGreaterThan(0)
  })

  it("[* h1] → [*** h3] の順序 → 逆転を検出", () => {
    const lines = ["[* 大見出し]", "[*** 小見出し]"]
    expect(findingsFor(lines, "reversed-heading-hierarchy").length).toBeGreaterThan(0)
  })

  it("[*** 大見出し] → [* 小見出し] の順序 → 検出しない (正しい順序)", () => {
    // 大きいサイズが先 → 正しい Cosense 的な使い方
    const lines = ["[*** 大見出し]", "本文", "[* 注釈]"]
    expect(findingsFor(lines, "reversed-heading-hierarchy").length).toBe(0)
  })

  it("[** 中見出し] → [* 小見出し] → 検出しない", () => {
    const lines = ["[** 中見出し]", "[* 小見出し]"]
    expect(findingsFor(lines, "reversed-heading-hierarchy").length).toBe(0)
  })

  it("[* ] のみのファイル → 検出しない (比較対象なし)", () => {
    const lines = ["[* 章1]", "本文", "[* 章2]"]
    expect(findingsFor(lines, "reversed-heading-hierarchy").length).toBe(0)
  })

  it("issue #82 の実例: * 見出し群 → ** 見出し群 → 検出", () => {
    const lines = [
      "[* 研究の4段階フェーズ]",
      "本文",
      "[* 手法の系譜]",
      "[** ① ルールベース・幾何学的手法]",
      "詳細",
    ]
    expect(findingsFor(lines, "reversed-heading-hierarchy").length).toBeGreaterThan(0)
  })
})

// ==============================
// ルール 3: markdown-bold-residue
// ==============================
describe("markdown-bold-residue", () => {
  it("**bold** → 検出", () => {
    expect(findingsFor(["**太字テキスト**"], "markdown-bold-residue").length).toBe(1)
  })

  it("__bold__ → 検出", () => {
    expect(findingsFor(["__太字テキスト__"], "markdown-bold-residue").length).toBe(1)
  })

  it("[* bold] — Cosense 記法は検出しない", () => {
    expect(findingsFor(["[* 太字テキスト]"], "markdown-bold-residue").length).toBe(0)
  })

  it("文中の **bold** → 検出", () => {
    const findings = findingsFor(["これは**重要な**テキストです"], "markdown-bold-residue")
    expect(findings.length).toBe(1)
  })

  it("code: ブロック内の **bold** → 検出しない", () => {
    const lines = ["code:readme.md", " ## **重要**", " テキスト"]
    expect(findingsFor(lines, "markdown-bold-residue").length).toBe(0)
  })

  it("インラインコード `**bold**` → 検出しない", () => {
    expect(findingsFor(["`**太字**` はこう書きます"], "markdown-bold-residue").length).toBe(0)
  })
})

// ==============================
// ルール 4: markdown-italic-residue
// ==============================
describe("markdown-italic-residue", () => {
  it("*italic* → 検出", () => {
    expect(findingsFor(["*斜体テキスト*"], "markdown-italic-residue").length).toBe(1)
  })

  it("_italic_ → 検出", () => {
    expect(findingsFor(["_斜体テキスト_"], "markdown-italic-residue").length).toBe(1)
  })

  it("[/ italic] — Cosense 記法は検出しない", () => {
    expect(findingsFor(["[/ 斜体テキスト]"], "markdown-italic-residue").length).toBe(0)
  })

  it("[* 太字] の * を italic として誤検出しない", () => {
    // [* テキスト] の * は Cosense の太字記法
    expect(findingsFor(["[* テキスト]"], "markdown-italic-residue").length).toBe(0)
  })

  it("**bold** の内側の * を italic として誤検出しない", () => {
    // **bold** は bold-residue ルールで検出すべきで、italic ルールは対象外
    expect(findingsFor(["**太字**"], "markdown-italic-residue").length).toBe(0)
  })

  it("code: ブロック内の *italic* → 検出しない", () => {
    const lines = ["code:example.md", " *斜体* はこう書く"]
    expect(findingsFor(lines, "markdown-italic-residue").length).toBe(0)
  })

  it("インラインコード `*italic*` → 検出しない", () => {
    expect(findingsFor(["`*italic*` はこう書きます"], "markdown-italic-residue").length).toBe(0)
  })

  it("URL 内の _ → 検出しない", () => {
    // https://example.com/foo_bar_baz は italic ではない
    expect(findingsFor(["https://example.com/foo_bar_baz"], "markdown-italic-residue").length).toBe(
      0,
    )
  })
})

// ==============================
// 複合テスト
// ==============================
describe("lintNotation 複合", () => {
  it("正常なCosense記法のみのファイルは空配列を返す", () => {
    const lines = [
      "[*** 大見出し]",
      "通常のテキスト",
      "[** 中見出し]",
      " 箇条書き",
      "[* 強調]",
      "[/ 斜体]",
      "[- 打ち消し]",
      "[ページリンク]",
      "https://example.com",
    ]
    expect(lintNotation(lines)).toEqual([])
  })

  it("finding は line・rule・severity・message をすべて持つ", () => {
    const findings = lintNotation(["[*テスト]"])
    expect(findings.length).toBe(1)
    const f = findings[0]
    expect(typeof f?.line).toBe("number")
    expect(typeof f?.rule).toBe("string")
    expect(f?.severity).toBe("warning")
    expect(typeof f?.message).toBe("string")
  })

  it("finding に hint が含まれる", () => {
    const findings = lintNotation(["[*テスト]"])
    expect(findings[0]?.hint).toBeTruthy()
  })
})
