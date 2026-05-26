/**
 * credential-store.test.ts — CredentialStore interface とアダプタ実装のテスト。
 *
 * TokenStore を内部バックエンドに使いながら、Credential 型で CRUD できることを確認する。
 * legacy 平文 SID/PAT 値 (JSON エンベロープ以前に保存されたもの) の互換読み出しも検証する。
 */

import { describe, expect, it } from "bun:test"
import type { Credential } from "@/core/auth/credential"
import { InMemoryCredentialStore, TokenStoreCredentialAdapter } from "@/core/auth/credential-store"
import { InMemoryTokenStore } from "@/core/auth/store"

// テスト用フィクスチャ
const VALID_SID = "s%3AabcDEF123456789012345678901234567890"
const VALID_PAT = `pat_${"a".repeat(64)}`
const VALID_SA_KEY = `cs_${"b".repeat(64)}`

describe("TokenStoreCredentialAdapter — SID Credential の保存と読み出し", () => {
  it("SID Credential を保存して取得できる", async () => {
    const tokenStore = new InMemoryTokenStore()
    const store = new TokenStoreCredentialAdapter(tokenStore)
    const cred: Credential = { kind: "sid", value: VALID_SID }

    await store.save("個人用プロファイル", cred)
    const loaded = await store.load("個人用プロファイル")

    expect(loaded).not.toBeNull()
    expect(loaded?.kind).toBe("sid")
    expect(loaded?.value).toBe(VALID_SID)
  })

  it("SID Credential の defaultProject が保持される", async () => {
    const tokenStore = new InMemoryTokenStore()
    const store = new TokenStoreCredentialAdapter(tokenStore)
    const cred: Credential = { kind: "sid", value: VALID_SID, defaultProject: "私のプロジェクト" }

    await store.save("仕事用プロファイル", cred)
    const loaded = await store.load("仕事用プロファイル")

    expect(loaded?.defaultProject).toBe("私のプロジェクト")
  })
})

describe("TokenStoreCredentialAdapter — PAT Credential の保存と読み出し", () => {
  it("PAT Credential を保存して取得できる", async () => {
    const tokenStore = new InMemoryTokenStore()
    const store = new TokenStoreCredentialAdapter(tokenStore)
    const cred: Credential = { kind: "pat", value: VALID_PAT }

    await store.save("個人PAT", cred)
    const loaded = await store.load("個人PAT")

    expect(loaded?.kind).toBe("pat")
    expect(loaded?.value).toBe(VALID_PAT)
  })
})

describe("TokenStoreCredentialAdapter — SA Credential の保存と読み出し", () => {
  it("SA Credential を保存して取得できる", async () => {
    const tokenStore = new InMemoryTokenStore()
    const store = new TokenStoreCredentialAdapter(tokenStore)
    const cred: Credential = {
      kind: "sa",
      value: VALID_SA_KEY,
      defaultProject: "チーム開発プロジェクト",
    }

    await store.save("チームSA", cred)
    const loaded = await store.load("チームSA")

    expect(loaded?.kind).toBe("sa")
    expect(loaded?.value).toBe(VALID_SA_KEY)
    expect(loaded?.defaultProject).toBe("チーム開発プロジェクト")
  })
})

describe("TokenStoreCredentialAdapter — legacy 平文値の互換読み出し", () => {
  it("legacy 平文 SID 値を SID Credential として読み出せる", async () => {
    // 旧バージョンが保存した平文 SID 文字列を新アダプタで読める
    const tokenStore = new InMemoryTokenStore()
    await tokenStore.save("旧プロファイル", VALID_SID)
    const store = new TokenStoreCredentialAdapter(tokenStore)

    const loaded = await store.load("旧プロファイル")

    expect(loaded?.kind).toBe("sid")
    expect(loaded?.value).toBe(VALID_SID)
  })

  it("legacy 平文 PAT 値を PAT Credential として読み出せる", async () => {
    // 旧バージョンが保存した平文 PAT 文字列を新アダプタで読める
    const tokenStore = new InMemoryTokenStore()
    await tokenStore.save("旧PATプロファイル", VALID_PAT)
    const store = new TokenStoreCredentialAdapter(tokenStore)

    const loaded = await store.load("旧PATプロファイル")

    expect(loaded?.kind).toBe("pat")
    expect(loaded?.value).toBe(VALID_PAT)
  })
})

describe("TokenStoreCredentialAdapter — 削除操作", () => {
  it("プロファイルを削除できる", async () => {
    const tokenStore = new InMemoryTokenStore()
    const store = new TokenStoreCredentialAdapter(tokenStore)
    const cred: Credential = { kind: "sid", value: VALID_SID }

    await store.save("削除対象プロファイル", cred)
    await store.delete("削除対象プロファイル")

    expect(await store.load("削除対象プロファイル")).toBeNull()
  })

  it("存在しないプロファイルを load すると null を返す", async () => {
    const tokenStore = new InMemoryTokenStore()
    const store = new TokenStoreCredentialAdapter(tokenStore)

    expect(await store.load("存在しないプロファイル")).toBeNull()
  })
})

describe("TokenStoreCredentialAdapter — list 操作", () => {
  it("保存したプロファイルの一覧を kind 付きで返す", async () => {
    const tokenStore = new InMemoryTokenStore()
    const store = new TokenStoreCredentialAdapter(tokenStore)

    await store.save("個人用SID", { kind: "sid", value: VALID_SID })
    await store.save("個人PAT", { kind: "pat", value: VALID_PAT })
    await store.save("チームSA", {
      kind: "sa",
      value: VALID_SA_KEY,
      defaultProject: "team-project",
    })

    const list = await store.list()

    expect(list).toHaveLength(3)
    const sidEntry = list.find((e) => e.profile === "個人用SID")
    expect(sidEntry?.kind).toBe("sid")
    const patEntry = list.find((e) => e.profile === "個人PAT")
    expect(patEntry?.kind).toBe("pat")
    const saEntry = list.find((e) => e.profile === "チームSA")
    expect(saEntry?.kind).toBe("sa")
    expect(saEntry?.defaultProject).toBe("team-project")
  })

  it("SA Credential の list エントリには defaultProject が含まれる", async () => {
    const tokenStore = new InMemoryTokenStore()
    const store = new TokenStoreCredentialAdapter(tokenStore)

    await store.save("SAプロファイル", {
      kind: "sa",
      value: VALID_SA_KEY,
      defaultProject: "開発チームプロジェクト",
    })

    const list = await store.list()
    expect(list[0]?.defaultProject).toBe("開発チームプロジェクト")
  })
})

describe("InMemoryCredentialStore — テスト用インメモリ実装", () => {
  it("SID Credential を保存して取得できる", async () => {
    const store = new InMemoryCredentialStore()
    const cred: Credential = { kind: "sid", value: VALID_SID }

    await store.save("default", cred)
    const loaded = await store.load("default")

    expect(loaded?.kind).toBe("sid")
    expect(loaded?.value).toBe(VALID_SID)
  })

  it("存在しないプロファイルは null を返す", async () => {
    const store = new InMemoryCredentialStore()
    expect(await store.load("nonexistent")).toBeNull()
  })

  it("プロファイルを削除できる", async () => {
    const store = new InMemoryCredentialStore()
    await store.save("削除テスト", { kind: "pat", value: VALID_PAT })
    await store.delete("削除テスト")
    expect(await store.load("削除テスト")).toBeNull()
  })

  it("list が kind/profile/defaultProject を含む配列を返す", async () => {
    const store = new InMemoryCredentialStore()
    await store.save("personalSID", { kind: "sid", value: VALID_SID })
    await store.save("teamSA", { kind: "sa", value: VALID_SA_KEY, defaultProject: "team-proj" })

    const list = await store.list()
    expect(list).toHaveLength(2)
    expect(list.some((e) => e.profile === "personalSID" && e.kind === "sid")).toBe(true)
    expect(list.some((e) => e.profile === "teamSA" && e.kind === "sa")).toBe(true)
  })
})
