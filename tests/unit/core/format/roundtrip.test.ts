/**
 * roundtrip.test.ts — Scrapbox 記法 ↔ Markdown のラウンドトリップテスト。
 *
 * 完全一致を保証するのではなく、意味的に等価な変換が維持されることを確認する。
 * 既知の非可逆変換は明示的にコメントで示す。
 */

import { describe, expect, test } from "bun:test"
import { convert } from "@/core/format/index"

describe("Scrapbox → MD → Scrapbox ラウンドトリップ", () => {
  test("プレーンテキストはラウンドトリップ後も同等", () => {
    const original = "タイトルページ\nプレーンなテキストが含まれる行\n2行目のテキスト"
    const md = convert(original, "scrapbox", "md")
    const backToSb = convert(md, "md", "scrapbox")
    // タイトルは h1 → [*** text] に変換されるので完全一致ではない
    expect(backToSb).toContain("プレーンなテキストが含まれる行")
    expect(backToSb).toContain("2行目のテキスト")
  })

  test("見出し (auto モード) はラウンドトリップ後も同等の構造", () => {
    const original = "タイトル\n[*** 大見出し]\n内容テキスト"
    const md = convert(original, "scrapbox", "md")
    expect(md).toContain("## 大見出し")
    const backToSb = convert(md, "md", "scrapbox")
    expect(backToSb).toContain("[*** 大見出し]")
    expect(backToSb).toContain("内容テキスト")
  })

  test("URL リンクはラウンドトリップ後も同等", () => {
    const original = "タイトル\n[https://example.com リンクテキスト]"
    const md = convert(original, "scrapbox", "md")
    expect(md).toContain("[リンクテキスト](https://example.com)")
    const backToSb = convert(md, "md", "scrapbox")
    expect(backToSb).toContain("[https://example.com リンクテキスト]")
  })
})

describe("MD → Scrapbox → MD ラウンドトリップ", () => {
  test("見出しはラウンドトリップ後も同等 (Scrapbox タイトルを先頭に付けた形で)", () => {
    // mdToScrapbox は本文行のみを変換する。scrapboxToMd はタイトル付き全体を処理する。
    // ラウンドトリップには「タイトルページ\n」を先頭に付けて scrapboxToMd に渡す。
    const mdBody = "## 大見出し\n### 中見出し\n本文テキスト"
    const sb = convert(mdBody, "md", "scrapbox")
    expect(sb).toContain("[*** 大見出し]")
    expect(sb).toContain("[** 中見出し]")
    // scrapboxToMd はタイトル行を先頭に必要とするので追加する
    const sbWithTitle = `タイトルページ\n${sb}`
    const backToMd = convert(sbWithTitle, "scrapbox", "md")
    expect(backToMd).toContain("## 大見出し")
    expect(backToMd).toContain("### 中見出し")
    expect(backToMd).toContain("本文テキスト")
  })

  test("太字テキストはラウンドトリップ後も同等 (タイトル付き形式で)", () => {
    // page edit ユースケース: MD 本文 → Scrapbox 本文 → 取得後 MD で確認
    const mdBody = "これは **太字テキスト** です"
    const sb = convert(mdBody, "md", "scrapbox")
    expect(sb).toContain("[* 太字テキスト]")
    // Scrapbox からの取得は「タイトル + 本文」形式なのでタイトルを付ける
    const sbWithTitle = `テストページ\n${sb}`
    const backToMd = convert(sbWithTitle, "scrapbox", "md")
    // [* text] がインライン (行全体でない) の場合は太字として戻る
    expect(backToMd).toContain("**太字テキスト**")
  })
})

describe("既知の非可逆変換 (仕様として許容)", () => {
  test("italic: *text* → [/ text] → *text* (往復OK)", () => {
    // MD の *text* と _text_ は Scrapbox では [/ text] に統一される
    // Scrapbox → MD では *text* に変換されるので往復可能
    const original = "*イタリックテキスト*"
    const sb = convert(original, "md", "scrapbox")
    expect(sb).toBe("[/ イタリックテキスト]")
    const backToMd = convert(`タイトル\n${sb}`, "scrapbox", "md")
    expect(backToMd).toContain("*イタリックテキスト*")
  })
})
