/**
 * session.test.ts — core/auth/session の単体テスト。
 *
 * TokenStore をモックに差し替えてセッション取得フローを検証する。
 */

import { describe, expect, it } from "bun:test"
import { loadSession, saveSession } from "@/core/auth/session"
import { InMemoryTokenStore } from "@/core/auth/store"

describe("saveSession", () => {
  it("TokenStore に connect.sid を保存する", async () => {
    const store = new InMemoryTokenStore()
    await saveSession(store, { profile: "default", sid: "my-session-id" })
    const token = await store.load("default")
    expect(token).toBe("my-session-id")
  })
})

describe("loadSession", () => {
  it("保存済みの connect.sid を取得する", async () => {
    const store = new InMemoryTokenStore()
    await store.save("work", "work-session-id")
    const sid = await loadSession(store, { profile: "work" })
    expect(sid).toBe("work-session-id")
  })

  it("セッションが存在しない場合は undefined を返す", async () => {
    const store = new InMemoryTokenStore()
    const sid = await loadSession(store, { profile: "存在しないプロファイル" })
    expect(sid).toBeUndefined()
  })

  it("profile 未指定時は default プロファイルを使う", async () => {
    const store = new InMemoryTokenStore()
    await store.save("default", "default-session")
    const sid = await loadSession(store, {})
    expect(sid).toBe("default-session")
  })
})
