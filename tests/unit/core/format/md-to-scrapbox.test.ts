/**
 * md-to-scrapbox.test.ts — Markdown を Scrapbox 記法に変換するロジックのテスト。
 *
 * RED: mdToScrapbox 関数が存在しないため、このテストは最初すべて失敗する。
 */

import { describe, expect, test } from "bun:test"
import { mdToScrapbox } from "@/core/format/md-to-scrapbox"

// --- 見出し ---
describe("見出し変換", () => {
  test("# h1 → そのまま (タイトル行として扱われる)", () => {
    // h1 は Scrapbox ではタイトル行。page edit などで使う場合は先頭行のみ。
    // 本文として h1 を含む入力は行ベースで [*** text] に変換する
    const input = "# ドキュメントタイトル"
    expect(mdToScrapbox(input)).toBe("[*** ドキュメントタイトル]")
  })

  test("## h2 → [*** テキスト]", () => {
    const input = "## 大見出し"
    expect(mdToScrapbox(input)).toBe("[*** 大見出し]")
  })

  test("### h3 → [** テキスト]", () => {
    const input = "### 中見出し"
    expect(mdToScrapbox(input)).toBe("[** 中見出し]")
  })

  test("#### h4 → [* テキスト]", () => {
    const input = "#### 小見出し"
    expect(mdToScrapbox(input)).toBe("[* 小見出し]")
  })

  test("##### h5 → [* テキスト] (h4 相当に丸める)", () => {
    const input = "##### 最小見出し"
    expect(mdToScrapbox(input)).toBe("[* 最小見出し]")
  })
})

// --- 太字・イタリック・取り消し線 ---
describe("装飾変換", () => {
  test("**太字** → [* 太字]", () => {
    const input = "これは **太字テキスト** です"
    expect(mdToScrapbox(input)).toBe("これは [* 太字テキスト] です")
  })

  test("__太字__ → [* 太字]", () => {
    const input = "__アンダースコア太字__"
    expect(mdToScrapbox(input)).toBe("[* アンダースコア太字]")
  })

  test("*イタリック* → [/ イタリック]", () => {
    const input = "*イタリックテキスト*"
    expect(mdToScrapbox(input)).toBe("[/ イタリックテキスト]")
  })

  test("_イタリック_ → [/ イタリック]", () => {
    const input = "_アンダースコアイタリック_"
    expect(mdToScrapbox(input)).toBe("[/ アンダースコアイタリック]")
  })

  test("~~取り消し線~~ → [- テキスト]", () => {
    const input = "~~削除されたテキスト~~"
    expect(mdToScrapbox(input)).toBe("[- 削除されたテキスト]")
  })
})

// --- リンク ---
describe("リンク変換", () => {
  test("[テキスト](url) → [url テキスト]", () => {
    const input = "[リンクテキスト](https://example.com)"
    expect(mdToScrapbox(input)).toBe("[https://example.com リンクテキスト]")
  })

  test("<https://example.com> → [https://example.com]", () => {
    const input = "<https://example.com>"
    expect(mdToScrapbox(input)).toBe("[https://example.com]")
  })

  test("[テキスト](内部ページ) → [内部ページ テキスト]", () => {
    const input = "[ページ名](ページ名)"
    expect(mdToScrapbox(input)).toBe("[ページ名 ページ名]")
  })
})

// --- インラインコード ---
describe("インラインコード変換", () => {
  test("`code` → `code` (そのまま)", () => {
    const input = "`const x = 1`"
    expect(mdToScrapbox(input)).toBe("`const x = 1`")
  })
})

// --- コードフェンス ---
describe("コードフェンス変換", () => {
  test("```lang\n本文\n``` → code:lang\n 本文", () => {
    const input = "```typescript\nconst x = 1\nreturn x\n```"
    expect(mdToScrapbox(input)).toBe("code:typescript\n const x = 1\n return x")
  })

  test("``` (ファイル名なし)\n本文\n``` → code:\n 本文", () => {
    const input = "```\nconsole.log('hello')\n```"
    expect(mdToScrapbox(input)).toBe("code:\n console.log('hello')")
  })

  test("コードブロック内の空行は ' ' (スペース) に変換される", () => {
    // MD の空行 "" は bodyLines.map(l => ` ${l}`) で " " になる
    // Scrapbox 記法ではコードブロック内の空行に先頭スペースが必要
    const input = "```python\ndef hello():\n\n    print('hello')\n```"
    expect(mdToScrapbox(input)).toBe("code:python\n def hello():\n \n     print('hello')")
  })
})

// --- リスト ---
describe("リスト変換", () => {
  test("- 項目 → \\t項目", () => {
    const input = "- リスト項目"
    expect(mdToScrapbox(input)).toBe("\tリスト項目")
  })

  test("* 項目 → \\t項目", () => {
    const input = "* アスタリスクリスト"
    expect(mdToScrapbox(input)).toBe("\tアスタリスクリスト")
  })

  test("1. 番号付き項目 → 1. 番号付き項目 (インデント + 番号保持)", () => {
    const input = "1. 番号付き項目"
    expect(mdToScrapbox(input)).toBe("\t1. 番号付き項目")
  })
})

// --- 引用 ---
describe("引用変換", () => {
  test("> 引用テキスト → > 引用テキスト (そのまま)", () => {
    const input = "> 引用された内容"
    expect(mdToScrapbox(input)).toBe("> 引用された内容")
  })
})

// --- 空行 ---
describe("空行変換", () => {
  test("空行は保持される", () => {
    const input = "1行目\n\n3行目"
    expect(mdToScrapbox(input)).toBe("1行目\n\n3行目")
  })
})

// --- 複合ケース ---
describe("複合変換", () => {
  test("見出しと本文の複合", () => {
    const input = "## 見出し\n\n本文の段落"
    expect(mdToScrapbox(input)).toBe("[*** 見出し]\n\n本文の段落")
  })

  test("太字とリンクの複合", () => {
    const input = "**太字** と [リンク](https://example.com)"
    expect(mdToScrapbox(input)).toBe("[* 太字] と [https://example.com リンク]")
  })
})
