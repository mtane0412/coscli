/**
 * keychain-file.test.ts — ファイルベース TokenStore のテスト。
 *
 * アトミック書き込み・ディレクトリ権限・JSON 破損時の挙動を含む。
 */

import { afterEach, describe, expect, it } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
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

  describe("ディレクトリ権限", () => {
    it("新規ディレクトリを 0o700 で作成する", async () => {
      const base = mkdtempSync(join(tmpdir(), "cos-file-test-"))
      const storePath = join(base, "newsubdir", "secrets.json")
      try {
        const store = new FileTokenStore(storePath)
        await store.save("テストプロファイル", "sid-abcdef")

        if (process.platform !== "win32") {
          const stat = statSync(join(base, "newsubdir"))
          // 新規作成ディレクトリのパーミッションが 0o700 であることを確認する
          expect(stat.mode & 0o777).toBe(0o700)
        }
      } finally {
        rmSync(base, { recursive: true, force: true })
      }
    })

    it("既存ディレクトリを 0o700 に絞り込む", async () => {
      const base = mkdtempSync(join(tmpdir(), "cos-file-test-"))
      try {
        // 意図的に緩い権限で作成されているディレクトリを対象にする
        chmodSync(base, 0o755)
        const storePath = join(base, "secrets.json")
        const store = new FileTokenStore(storePath)
        await store.save("テストプロファイル", "sid-abcdef")

        if (process.platform !== "win32") {
          const stat = statSync(base)
          // 既存ディレクトリのパーミッションが 0o700 に更新されることを確認する
          expect(stat.mode & 0o777).toBe(0o700)
        }
      } finally {
        rmSync(base, { recursive: true, force: true })
      }
    })
  })

  describe("アトミック書き込み", () => {
    it("書き込み後に対象ファイル由来の .tmp ファイルが残らない", async () => {
      const store = new FileTokenStore(tmpFile)
      await store.save("テストプロファイル", "sid-abcdef")

      // tmpFile のベース名に由来する .tmp ファイルが残っていないことを確認する
      const dir = dirname(tmpFile)
      const base = basename(tmpFile)
      const tmpFiles = readdirSync(dir).filter((f) => f.startsWith(base) && f.endsWith(".tmp"))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe("JSON 破損ファイルの処理", () => {
    it("破損ファイルに対する save は throw する (上書きによるデータ消失を防ぐ)", async () => {
      // 前提: 破損した JSON ファイルが存在する
      writeFileSync(tmpFile, "{ invalid json {{{", { mode: 0o600 })
      const store = new FileTokenStore(tmpFile)
      // 検証: save が throw することで上書きによる他プロファイルの消失を防ぐ
      await expect(store.save("テストプロファイル", "sid-abcdef")).rejects.toThrow()
    })

    it("破損ファイルに対する load は null を返す", async () => {
      writeFileSync(tmpFile, "{ invalid json {{{", { mode: 0o600 })
      const store = new FileTokenStore(tmpFile)
      // 検証: load はエラーなく null を返す (read を試みて失敗→安全なデフォルト)
      expect(await store.load("テストプロファイル")).toBeNull()
    })

    it("破損ファイルに対する list は空配列を返す", async () => {
      writeFileSync(tmpFile, "{ invalid json {{{", { mode: 0o600 })
      const store = new FileTokenStore(tmpFile)
      // 検証: list はエラーなく空配列を返す
      expect(await store.list()).toEqual([])
    })

    it("破損ファイルに対する delete は throw する", async () => {
      // 前提: 破損した JSON ファイルが存在する
      writeFileSync(tmpFile, "{ invalid json {{{", { mode: 0o600 })
      const store = new FileTokenStore(tmpFile)
      // 検証: delete が throw することで上書きによる他プロファイルの消失を防ぐ
      await expect(store.delete("テストプロファイル")).rejects.toThrow()
    })

    it("配列形式の JSON ファイルに対する save は throw する", async () => {
      // 前提: プレーンオブジェクト以外の JSON (配列) が保存されている
      writeFileSync(tmpFile, "[]", { mode: 0o600 })
      const store = new FileTokenStore(tmpFile)
      // 検証: save が throw することで配列への代入による永続化失敗を防ぐ
      await expect(store.save("テストプロファイル", "sid-abcdef")).rejects.toThrow()
    })

    it("null の JSON ファイルに対する save は throw する", async () => {
      // 前提: null が保存されている不正なファイル
      writeFileSync(tmpFile, "null", { mode: 0o600 })
      const store = new FileTokenStore(tmpFile)
      // 検証: save が throw することでデータ消失を防ぐ
      await expect(store.save("テストプロファイル", "sid-abcdef")).rejects.toThrow()
    })
  })
})
