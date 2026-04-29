/**
 * keychain-file.test.ts — ファイルベース TokenStore のテスト。
 */

import { afterEach, describe, expect, it } from "bun:test"
import { existsSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FileTokenStore } from "@/infra/keychain/file"

const tmpFile = join(tmpdir(), `coscli-test-secrets-${Date.now()}.json`)

describe("FileTokenStore", () => {
  afterEach(() => {
    if (existsSync(tmpFile)) unlinkSync(tmpFile)
  })

  it("セッション ID を保存して取得できる", async () => {
    const store = new FileTokenStore(tmpFile)
    await store.save("default", "test-sid-12345")
    expect(await store.load("default")).toBe("test-sid-12345")
  })

  it("存在しないプロファイルは null を返す", async () => {
    const store = new FileTokenStore(tmpFile)
    expect(await store.load("nonexistent")).toBeNull()
  })

  it("削除後は null を返す", async () => {
    const store = new FileTokenStore(tmpFile)
    await store.save("default", "test-sid")
    await store.delete("default")
    expect(await store.load("default")).toBeNull()
  })

  it("複数プロファイルを独立して管理できる", async () => {
    const store = new FileTokenStore(tmpFile)
    await store.save("個人アカウント", "sid-personal")
    await store.save("仕事アカウント", "sid-work")
    expect(await store.load("個人アカウント")).toBe("sid-personal")
    expect(await store.load("仕事アカウント")).toBe("sid-work")
  })

  it("プロファイル一覧を取得できる", async () => {
    const store = new FileTokenStore(tmpFile)
    await store.save("個人アカウント", "sid-personal")
    await store.save("仕事アカウント", "sid-work")
    const profiles = await store.list()
    expect(profiles).toContain("個人アカウント")
    expect(profiles).toContain("仕事アカウント")
  })

  it("ファイルが存在しない場合は空リストを返す", async () => {
    const store = new FileTokenStore(tmpFile)
    const profiles = await store.list()
    expect(profiles).toHaveLength(0)
  })
})
