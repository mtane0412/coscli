/**
 * keychain-secret-tool.test.ts — Linux secret-tool (libsecret) を使った実インテグレーションテスト。
 *
 * このテストは Linux 環境でのみ実行されます。他の OS では自動的にスキップします。
 * 実行前提:
 *   - secret-tool コマンドがインストール済み (apt: libsecret-tools)
 *   - GNOME Keyring デーモンが起動済み (DBUS_SESSION_BUS_ADDRESS が設定されている)
 *
 * CI セットアップ例:
 *   sudo apt-get install -y --no-install-recommends gnome-keyring dbus-x11 libsecret-tools
 *   eval $(dbus-launch --sh-syntax)
 *   echo -n "" | gnome-keyring-daemon --unlock --components=secrets
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { LinuxKeychainStore } from "@/infra/keychain/linux"

// Linux 以外ではスキップ
const describeSuite = process.platform === "linux" ? describe : describe.skip

describeSuite("LinuxKeychainStore インテグレーションテスト (secret-tool 使用)", () => {
  // 他の Secret Service エントリと衝突しない一意なプロファイル名を使用
  const TEST_PROFILE = "cos-integration-test-山田太郎"
  const TEST_SID = "test-session-id-abcdef123456"
  // describe.skip でも callback は評価されるため、store の生成は beforeAll に移動する
  let store: LinuxKeychainStore

  beforeAll(async () => {
    store = new LinuxKeychainStore()
    // テスト前にエントリが残っていれば削除してクリーンな状態にする
    await store.delete(TEST_PROFILE)
  })

  afterAll(async () => {
    // テスト後のクリーンアップ
    await store.delete(TEST_PROFILE)
  })

  it("save してから load で同じ SID を取得できる", async () => {
    // 前提: プロファイルが存在しない
    await store.save(TEST_PROFILE, TEST_SID)
    const loaded = await store.load(TEST_PROFILE)
    // 検証: 保存した SID が正確に復元される
    expect(loaded).toBe(TEST_SID)
  })

  it("save を 2 回呼んでも上書きされる（update 動作）", async () => {
    const newSid = "test-session-id-updated-999"
    // 前提: 既存エントリがある
    await store.save(TEST_PROFILE, TEST_SID)

    await store.save(TEST_PROFILE, newSid)
    const loaded = await store.load(TEST_PROFILE)
    // 検証: 最新の SID に更新されている
    expect(loaded).toBe(newSid)
  })

  it("list で保存したプロファイルが含まれる", async () => {
    // 前提: プロファイルが保存済み
    await store.save(TEST_PROFILE, TEST_SID)
    const profiles = await store.list()
    // 検証: list にテストプロファイルが含まれる
    expect(profiles).toContain(TEST_PROFILE)
  })

  it("delete 後に load すると null を返す", async () => {
    // 前提: プロファイルが存在する
    await store.save(TEST_PROFILE, TEST_SID)

    await store.delete(TEST_PROFILE)
    const loaded = await store.load(TEST_PROFILE)
    // 検証: 削除後は null
    expect(loaded).toBeNull()
  })

  it("存在しないプロファイルの load は null を返す", async () => {
    // 前提: 存在しないプロファイル名を使用
    const loaded = await store.load("cos-integration-test-存在しないユーザー")
    // 検証: null を返す（エラーにならない）
    expect(loaded).toBeNull()
  })

  it("存在しないプロファイルの delete はエラーにならない", async () => {
    // 検証: delete は存在しなくても例外を投げない
    await expect(store.delete("cos-integration-test-存在しないユーザー")).resolves.toBeUndefined()
  })
})
