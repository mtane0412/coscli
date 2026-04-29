/**
 * store.test.ts — TokenStore interface とインメモリ実装のテスト。
 *
 * 実際の OS keychain を使わず、InMemoryTokenStore で動作検証する。
 */

import { describe, expect, it } from "bun:test"
import { InMemoryTokenStore } from "@/core/auth/store"

describe("InMemoryTokenStore", () => {
  it("セッション ID を保存して取得できる", async () => {
    const store = new InMemoryTokenStore()
    await store.save("default", "my-connect-sid")
    expect(await store.load("default")).toBe("my-connect-sid")
  })

  it("存在しないプロファイルは null を返す", async () => {
    const store = new InMemoryTokenStore()
    expect(await store.load("nonexistent")).toBeNull()
  })

  it("セッション ID を削除できる", async () => {
    const store = new InMemoryTokenStore()
    await store.save("default", "my-sid")
    await store.delete("default")
    expect(await store.load("default")).toBeNull()
  })

  it("複数プロファイルを独立して管理できる", async () => {
    const store = new InMemoryTokenStore()
    await store.save("personal", "sid-personal")
    await store.save("work", "sid-work")
    expect(await store.load("personal")).toBe("sid-personal")
    expect(await store.load("work")).toBe("sid-work")
  })

  it("プロファイル一覧を取得できる", async () => {
    const store = new InMemoryTokenStore()
    await store.save("personal", "sid-personal")
    await store.save("work", "sid-work")
    const profiles = await store.list()
    expect(profiles).toContain("personal")
    expect(profiles).toContain("work")
    expect(profiles).toHaveLength(2)
  })

  it("削除後はプロファイル一覧から消える", async () => {
    const store = new InMemoryTokenStore()
    await store.save("default", "sid")
    await store.delete("default")
    const profiles = await store.list()
    expect(profiles).toHaveLength(0)
  })
})
