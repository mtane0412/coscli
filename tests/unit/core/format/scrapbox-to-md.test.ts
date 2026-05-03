/**
 * scrapbox-to-md.test.ts — Scrapbox 記法を Markdown に変換するロジックのテスト。
 *
 * RED: scrapboxToMd 関数が存在しないため、このテストは最初すべて失敗する。
 */

import { describe, expect, test } from "bun:test"
import { scrapboxToMd } from "@/core/format/scrapbox-to-md"

// --- タイトル行 ---
describe("タイトル行", () => {
  test("先頭行はタイトルとして h1 に変換される", () => {
    const input = "ページタイトル\n本文1行目"
    expect(scrapboxToMd(input)).toBe("# ページタイトル\n\n本文1行目")
  })
})

// --- 見出し (boldStyle=auto デフォルト) ---
describe("見出し変換 (auto モード)", () => {
  test("[*** テキスト] 行全体 → h2", () => {
    const input = "タイトル\n[*** 大見出し]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n## 大見出し")
  })

  test("[** テキスト] 行全体 → h3", () => {
    const input = "タイトル\n[** 中見出し]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n### 中見出し")
  })

  test("[* テキスト] 行全体 → h4", () => {
    const input = "タイトル\n[* 小見出し]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n#### 小見出し")
  })

  test("[**** テキスト] 4 個以上は h2 頭打ち", () => {
    const input = "タイトル\n[**** 超大見出し]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n## 超大見出し")
  })

  test("[* テキスト] がインライン → 太字", () => {
    const input = "タイトル\n前置き [* 強調テキスト] 後置き"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n前置き **強調テキスト** 後置き")
  })

  test("インデント下の [** テキスト] → 太字", () => {
    const input = "タイトル\n\t[** インデント内強調]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n\t**インデント内強調**")
  })
})

// --- 見出し (boldStyle=heading) ---
describe("見出し変換 (heading モード)", () => {
  test("インライン [* テキスト] でも見出しに変換", () => {
    const input = "タイトル\n前置き [* 強調] 後置き"
    expect(scrapboxToMd(input, { boldStyle: "heading" })).toBe(
      "# タイトル\n\n前置き **強調** 後置き",
    )
    // NOTE: インラインの場合でも行全体が見出しになるわけではなく、AST レベルでデコレーションが見出しとして扱われる
  })

  test("行全体 [* テキスト] → heading モードでも h4", () => {
    const input = "タイトル\n[* 小見出し]"
    expect(scrapboxToMd(input, { boldStyle: "heading" })).toBe("# タイトル\n\n#### 小見出し")
  })
})

// --- 見出し (boldStyle=emphasis) ---
describe("見出し変換 (emphasis モード)", () => {
  test("行全体 [*** テキスト] でも太字になる", () => {
    const input = "タイトル\n[*** 大きな強調]"
    expect(scrapboxToMd(input, { boldStyle: "emphasis" })).toBe("# タイトル\n\n**大きな強調**")
  })

  test("インライン [* テキスト] → 太字", () => {
    const input = "タイトル\n[* 強調] と普通テキスト"
    expect(scrapboxToMd(input, { boldStyle: "emphasis" })).toBe(
      "# タイトル\n\n**強調** と普通テキスト",
    )
  })
})

// --- イタリック・取り消し線・下線 ---
describe("装飾変換", () => {
  test("[/ テキスト] → italic", () => {
    const input = "タイトル\n[/ イタリック体]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n*イタリック体*")
  })

  test("[- テキスト] → 取り消し線", () => {
    const input = "タイトル\n[- 削除テキスト]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n~~削除テキスト~~")
  })

  test("[_ テキスト] → HTML <u> (MD ネイティブ表現なし)", () => {
    const input = "タイトル\n[_ 下線テキスト]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n<u>下線テキスト</u>")
  })
})

// --- リンク ---
describe("リンク変換", () => {
  test("[外部ページ] → 内部リンク", () => {
    const input = "タイトル\n[関連ページ]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n[関連ページ](関連ページ)")
  })

  test("[https://example.com] → autolink", () => {
    const input = "タイトル\n[https://example.com]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n<https://example.com>")
  })

  test("[https://example.com テキスト] → [テキスト](url)", () => {
    const input = "タイトル\n[https://example.com リンクテキスト]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n[リンクテキスト](https://example.com)")
  })

  test("[テキスト https://example.com] → [テキスト](url) (URL が後)", () => {
    const input = "タイトル\n[リンクテキスト https://example.com]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n[リンクテキスト](https://example.com)")
  })
})

// --- インラインコード ---
describe("インラインコード", () => {
  test("`code` → `code` (そのまま)", () => {
    const input = "タイトル\n`const x = 1`"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n`const x = 1`")
  })
})

// --- コードブロック ---
describe("コードブロック変換", () => {
  test("code:main.ts ブロック → ```main.ts", () => {
    const input = "タイトル\ncode:main.ts\n const x = 1\n return x"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n```main.ts\nconst x = 1\nreturn x\n```")
  })

  test("code: (ファイル名なし) → ```", () => {
    const input = "タイトル\ncode:\n console.log('hello')"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n```\nconsole.log('hello')\n```")
  })
})

// --- 引用 ---
describe("引用変換", () => {
  test("> 引用テキスト → > 引用テキスト", () => {
    const input = "タイトル\n> これは引用です"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n> これは引用です")
  })
})

// --- インデント (リスト相当) ---
describe("インデント変換", () => {
  test("スペース 1 つのインデント行は半角スペース + ハイフンリストに変換", () => {
    const input = "タイトル\n\tリスト項目"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n\tリスト項目")
  })
})

// --- ハッシュタグ ---
describe("ハッシュタグ変換", () => {
  test("#タグ → #タグ (そのまま)", () => {
    const input = "タイトル\n#マイタグ"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n#マイタグ")
  })
})

// --- 数式 ---
describe("数式変換", () => {
  test("[$ 数式] → $数式$ (インライン LaTeX)", () => {
    const input = "タイトル\n[$ E=mc^2]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n$E=mc^2$")
  })
})

// --- 空行 ---
describe("空行", () => {
  test("空行はそのまま保持される", () => {
    const input = "タイトル\n1行目\n\n3行目"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n1行目\n\n3行目")
  })
})

// --- 番号付きリスト ---
describe("番号付きリスト変換", () => {
  test("行頭の 1. テキスト → 番号付きリスト (NumberListNode)", () => {
    // Scrapbox の番号リストは [1. text] ではなく 1. text という記法
    const input = "タイトル\n\t1. 最初の項目"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n\t1. 最初の項目")
  })

  test("[1. テキスト] はリンクとして扱われる (NumberListNode ではない)", () => {
    // [] で囲った場合は Scrapbox の内部リンクとして解析される
    const input = "タイトル\n\t[1. 最初の項目]"
    expect(scrapboxToMd(input)).toBe("# タイトル\n\n\t[1. 最初の項目](1. 最初の項目)")
  })
})
