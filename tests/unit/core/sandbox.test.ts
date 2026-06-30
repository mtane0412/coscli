/**
 * sandbox.test.ts — コマンド実行許可ポリシーのテスト。
 *
 * --enable-commands / --disable-commands の組み合わせ挙動を検証する。
 */

import { describe, expect, it } from "bun:test"
import { PolicyError, createPolicy } from "@/core/sandbox"

describe("createPolicy / allow", () => {
  it("設定なしの場合は全コマンドを許可する", () => {
    const policy = createPolicy({})
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.delete")).toBeUndefined()
    expect(policy.allow("project.export")).toBeUndefined()
  })

  it("enable リストに含まれるコマンドを許可する", () => {
    const policy = createPolicy({ enable: ["page.list", "page.get"] })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.get")).toBeUndefined()
  })

  it("enable リストに含まれないコマンドを拒否する", () => {
    const policy = createPolicy({ enable: ["page.list", "page.get"] })
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    expect(policy.allow("project.export")).toBeInstanceOf(PolicyError)
  })

  it("disable リストに含まれるコマンドを拒否する", () => {
    const policy = createPolicy({ disable: ["page.delete"] })
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
  })

  it("disable リストに含まれないコマンドは通す", () => {
    const policy = createPolicy({ disable: ["page.delete"] })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("project.info")).toBeUndefined()
  })

  it("enable で絞った後 disable でさらに削る", () => {
    const policy = createPolicy({
      enable: ["page.list", "page.get", "page.delete"],
      disable: ["page.delete"],
    })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.get")).toBeUndefined()
    // enable リスト内でも disable で除外される
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    // enable に含まれない他のコマンドも拒否
    expect(policy.allow("project.info")).toBeInstanceOf(PolicyError)
  })

  it("ワイルドカード 'page' は page.* 全体を許可する", () => {
    const policy = createPolicy({ enable: ["page"] })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.delete")).toBeUndefined()
    // project 系は拒否
    expect(policy.allow("project.info")).toBeInstanceOf(PolicyError)
  })

  it("ワイルドカード 'page' を enable し 'page.delete' を disable する", () => {
    const policy = createPolicy({ enable: ["page"], disable: ["page.delete"] })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
  })
})

describe("exact モード (--enable-commands-exact)", () => {
  it("exact=true のとき glob 'page.*' はマッチしない (完全一致のみ)", () => {
    const policy = createPolicy({ enable: ["page.*"], exact: true })
    // glob は無効化されるため page.list はマッチしない
    expect(policy.allow("page.list")).toBeInstanceOf(PolicyError)
  })

  it("exact=true のとき noun ワイルドカード 'page' はマッチしない", () => {
    const policy = createPolicy({ enable: ["page"], exact: true })
    // noun ワイルドカードは無効化される
    expect(policy.allow("page.list")).toBeInstanceOf(PolicyError)
  })

  it("exact=true のとき完全一致はマッチする", () => {
    const policy = createPolicy({ enable: ["page.list", "page.get"], exact: true })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.get")).toBeUndefined()
    // リストにないコマンドは拒否
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
  })

  it("exact=true でも alias 解決は有効 (旧→新)", () => {
    // enableCommands: ["page.append.preview"] で page.edit.preview も許可される
    const policy = createPolicy({ enable: ["page.append.preview"], exact: true })
    expect(policy.allow("page.edit.preview")).toBeUndefined()
  })

  it("exact=false (デフォルト) では glob は有効", () => {
    const policy = createPolicy({ enable: ["page.*"], exact: false })
    expect(policy.allow("page.list")).toBeUndefined()
  })
})

describe("PolicyError", () => {
  it("コマンド名を含むメッセージを持つ", () => {
    const policy = createPolicy({ disable: ["page.delete"] })
    const err = policy.allow("page.delete")
    expect(err).toBeInstanceOf(PolicyError)
    expect((err as PolicyError).command).toBe("page.delete")
    expect((err as PolicyError).message).toContain("page.delete")
  })
})

describe("PolicyOptions のパース", () => {
  it("カンマ区切り文字列をリストに変換する", () => {
    const policy = createPolicy({ enableStr: "page.list,page.get", disableStr: "page.delete" })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    expect(policy.allow("project.info")).toBeInstanceOf(PolicyError)
  })

  it("空文字列は設定なし扱いにする", () => {
    const policy = createPolicy({ enableStr: "", disableStr: "" })
    expect(policy.allow("page.delete")).toBeUndefined()
  })
})

describe("ワイルドカード '*' / 'all'", () => {
  it("disable: ['*'] で全コマンドを拒否する", () => {
    const policy = createPolicy({ disable: ["*"] })
    expect(policy.allow("page.list")).toBeInstanceOf(PolicyError)
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    expect(policy.allow("project.info")).toBeInstanceOf(PolicyError)
  })

  it("disable: ['all'] で全コマンドを拒否する", () => {
    const policy = createPolicy({ disable: ["all"] })
    expect(policy.allow("page.list")).toBeInstanceOf(PolicyError)
    expect(policy.allow("project.info")).toBeInstanceOf(PolicyError)
  })

  it("disableStr '*' で全コマンドを拒否する (CLI フラグ形式)", () => {
    const policy = createPolicy({ disableStr: "*" })
    expect(policy.allow("page.list")).toBeInstanceOf(PolicyError)
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
  })
})

describe("'page.*' glob パターン", () => {
  it("disable: ['page.*'] で page.* 全体を拒否し他ドメインは通す", () => {
    const policy = createPolicy({ disable: ["page.*"] })
    expect(policy.allow("page.list")).toBeInstanceOf(PolicyError)
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    expect(policy.allow("project.info")).toBeUndefined()
  })

  it("enable: ['page.*'] で page.* のみ許可する", () => {
    const policy = createPolicy({ enable: ["page.*"] })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.delete")).toBeUndefined()
    expect(policy.allow("project.info")).toBeInstanceOf(PolicyError)
  })
})

describe("大文字小文字の正規化", () => {
  it("パターンの大文字を小文字に正規化してマッチする", () => {
    const policy = createPolicy({ enableStr: "PAGE.LIST,Page.Get" })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.get")).toBeUndefined()
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
  })

  it("disable パターンの大文字を正規化して拒否する", () => {
    const policy = createPolicy({ disable: ["PAGE.DELETE"] })
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    expect(policy.allow("page.list")).toBeUndefined()
  })
})

describe("Unicode 空白文字の正規化", () => {
  it("パターンに Unicode 空白文字が含まれていても正しくマッチする", () => {
    // ゼロ幅スペース (U+200B) や全角スペース (U+3000) を含むパターン
    const policy = createPolicy({ enableStr: "page.list\u200B,page.get\u3000" })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.get")).toBeUndefined()
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
  })

  it("ノーブレークスペース (U+00A0) を含むパターンを正規化する", () => {
    const policy = createPolicy({ disable: ["page.delete\u00A0"] })
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    expect(policy.allow("page.list")).toBeUndefined()
  })
})
