/**
 * sandbox/aliases.test.ts — sandbox 識別子の方向別 alias 解決テスト。
 *
 * PR 4 で追加した旧→新の alias 解決ルールを検証する。
 *
 * enable は双方向:
 *   - enableCommands: ["page.append.preview"] → page.edit.preview も enable
 *   - enableCommands: ["page.edit.preview"]  → page.append.preview も enable
 *
 * disable は旧→新の単方向のみ:
 *   - disableCommands: ["page.append.preview"] → page.edit.preview も disable
 *   - disableCommands: ["page.edit.preview"]   → page.append.preview は disable しない
 *     (逆方向伝播なし: disableCommands: ["page.get"] が page.text を止めないのと同じ)
 */

import { describe, expect, it } from "bun:test"
import { PolicyError, createPolicy } from "@/core/sandbox"

describe("sandbox alias — enable は双方向", () => {
  it("旧識別子 page.append.preview を enable すると page.edit.preview も許可される", () => {
    const policy = createPolicy({ enable: ["page.append.preview"] })
    // 新識別子も enable に含まれているとみなされる
    expect(policy.allow("page.edit.preview")).toBeUndefined()
  })

  it("新識別子 page.edit.preview を enable すると旧識別子 page.append.preview も許可される", () => {
    const policy = createPolicy({ enable: ["page.edit.preview"] })
    expect(policy.allow("page.append.preview")).toBeUndefined()
  })

  it("新識別子 page.edit.preview を enable すると page.prepend.preview, page.insert.preview なども許可される", () => {
    const policy = createPolicy({ enable: ["page.edit.preview"] })
    expect(policy.allow("page.prepend.preview")).toBeUndefined()
    expect(policy.allow("page.insert.preview")).toBeUndefined()
    expect(policy.allow("page.new.preview")).toBeUndefined()
    expect(policy.allow("page.line.replace.preview")).toBeUndefined()
    expect(policy.allow("page.line.delete.preview")).toBeUndefined()
  })

  it("alias と無関係なコマンドは enable されない", () => {
    const policy = createPolicy({ enable: ["page.append.preview"] })
    // page.delete は alias ではないので enable されない
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    expect(policy.allow("page.list")).toBeInstanceOf(PolicyError)
  })
})

describe("sandbox alias — disable は旧→新の単方向のみ", () => {
  it("旧識別子 page.append.preview を disable すると page.edit.preview も阻止される", () => {
    const policy = createPolicy({ disable: ["page.append.preview"] })
    // 旧→新方向: 旧 alias が disable に含まれれば新コマンドも阻止
    expect(policy.allow("page.edit.preview")).toBeInstanceOf(PolicyError)
  })

  it("新識別子 page.edit.preview を disable しても page.append.preview は阻止されない", () => {
    const policy = createPolicy({ disable: ["page.edit.preview"] })
    // 逆方向は適用しない (新→旧は伝播しない)
    expect(policy.allow("page.append.preview")).toBeUndefined()
    expect(policy.allow("page.prepend.preview")).toBeUndefined()
    expect(policy.allow("page.insert.preview")).toBeUndefined()
  })

  it("page.line.replace.preview を disable すると page.edit.preview も阻止される", () => {
    const policy = createPolicy({ disable: ["page.line.replace.preview"] })
    expect(policy.allow("page.edit.preview")).toBeInstanceOf(PolicyError)
  })

  it("alias と無関係なコマンドへの disable は影響しない", () => {
    const policy = createPolicy({ disable: ["page.append.preview"] })
    // page.delete など関係ないコマンドは通す
    expect(policy.allow("page.delete")).toBeUndefined()
    expect(policy.allow("page.list")).toBeUndefined()
  })
})

describe("sandbox alias — 既存動作の温存", () => {
  it("page.* glob は引き続き page 配下全体にマッチする", () => {
    const policy = createPolicy({ enable: ["page.*"] })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.edit.preview")).toBeUndefined()
    expect(policy.allow("page.append.preview")).toBeUndefined()
  })

  it("noun ワイルドカード page は引き続き page.* 全体にマッチする (後方互換)", () => {
    const policy = createPolicy({ enable: ["page"] })
    expect(policy.allow("page.list")).toBeUndefined()
    expect(policy.allow("page.edit.preview")).toBeUndefined()
  })

  it("page.delete の disable は alias に関係なくそのまま機能する", () => {
    const policy = createPolicy({ disable: ["page.delete"] })
    expect(policy.allow("page.delete")).toBeInstanceOf(PolicyError)
    expect(policy.allow("page.list")).toBeUndefined()
  })
})
