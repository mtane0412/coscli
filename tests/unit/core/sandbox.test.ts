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
