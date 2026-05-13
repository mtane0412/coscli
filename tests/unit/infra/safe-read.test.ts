/**
 * safe-read.test.ts — readFromFile / readStdinBounded のセキュリティテスト。
 *
 * --from-file で任意の機密ファイルが読まれないことを確認する。
 */

import { afterEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { UnsafePathError, readFromFile, readStdinBounded } from "@/infra/safe-read"

/** テスト用の一時ディレクトリを作成するヘルパ */
function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "coscli-safe-read-test-"))
}

describe("readFromFile", () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe("通常ファイルの読み込み", () => {
    it("通常のテキストファイルを読み込める", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "ブログ下書き.txt")
      writeFileSync(filePath, "Cosense に書き込む内容\n2行目")
      expect(readFromFile(filePath)).toBe("Cosense に書き込む内容\n2行目")
    })

    it("空ファイルは空文字列を返す", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "空ファイル.txt")
      writeFileSync(filePath, "")
      expect(readFromFile(filePath)).toBe("")
    })
  })

  describe("禁止ディレクトリのブロック", () => {
    it("/etc/passwd 相当のパスは UnsafePathError をスローする", () => {
      expect(() => readFromFile("/etc/passwd")).toThrow(UnsafePathError)
    })

    it("/etc ディレクトリ直下のファイルはブロックされる", () => {
      expect(() => readFromFile("/etc/hosts")).toThrow(UnsafePathError)
    })

    it("/proc/self/environ はブロックされる", () => {
      expect(() => readFromFile("/proc/self/environ")).toThrow(UnsafePathError)
    })
  })

  describe("禁止サフィックスのブロック", () => {
    it(".env ファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, ".env")
      writeFileSync(filePath, "SECRET_KEY=秘密の値")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it(".pem ファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "証明書.pem")
      writeFileSync(filePath, "-----BEGIN CERTIFICATE-----")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it(".key ファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "秘密鍵.key")
      writeFileSync(filePath, "-----BEGIN PRIVATE KEY-----")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it("id_rsa ファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "id_rsa")
      writeFileSync(filePath, "-----BEGIN RSA PRIVATE KEY-----")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it("id_ed25519 ファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "id_ed25519")
      writeFileSync(filePath, "-----BEGIN OPENSSH PRIVATE KEY-----")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })
  })

  describe("禁止ディレクトリ名のブロック", () => {
    it(".ssh ディレクトリ内のファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const sshDir = join(tmpDir, ".ssh")
      mkdirSync(sshDir)
      const filePath = join(sshDir, "authorized_keys")
      writeFileSync(filePath, "ssh-rsa AAAA... ユーザー名@ホスト名")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it(".aws ディレクトリ内のファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const awsDir = join(tmpDir, ".aws")
      mkdirSync(awsDir)
      const filePath = join(awsDir, "credentials")
      writeFileSync(filePath, "[default]\naws_access_key_id=AKIAIOSFODNN7EXAMPLE")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it(".gnupg ディレクトリ内のファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const gnupgDir = join(tmpDir, ".gnupg")
      mkdirSync(gnupgDir)
      const filePath = join(gnupgDir, "私の秘密鍵.gpg")
      writeFileSync(filePath, "GPG秘密鍵データ")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })
  })

  describe("シンボリックリンク経由のブロック", () => {
    it("禁止パスへのシンボリックリンクはブロックされる", () => {
      tmpDir = makeTempDir()
      const linkPath = join(tmpDir, "システムファイルへのリンク.txt")
      // /etc/hosts へのシンボリックリンクを作成
      symlinkSync("/etc/hosts", linkPath)
      expect(() => readFromFile(linkPath)).toThrow(UnsafePathError)
    })
  })

  describe("ファイルサイズ制限", () => {
    it("10 MiB を超えるファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "巨大ファイル.txt")
      // 10 MiB + 1 バイトのファイルを作成
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, "あ")
      writeFileSync(filePath, oversized)
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it("10 MiB ちょうどは読み込める", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "ちょうどのサイズ.txt")
      const content = Buffer.alloc(10 * 1024 * 1024, "a")
      writeFileSync(filePath, content)
      // サイズが 10 MiB ちょうどなら成功する
      expect(() => readFromFile(filePath)).not.toThrow()
    })
  })

  describe("secrets.json のブロック", () => {
    it("coscli/secrets.json はブロックされる", () => {
      tmpDir = makeTempDir()
      const configDir = join(tmpDir, "coscli")
      mkdirSync(configDir)
      const secretsPath = join(configDir, "secrets.json")
      writeFileSync(secretsPath, '{"default":"s%3A秘密のsid"}')
      expect(() => readFromFile(secretsPath)).toThrow(UnsafePathError)
    })
  })

  describe("大文字小文字を含むパスのブロック", () => {
    it(".SSH ディレクトリ内のファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const sshDir = join(tmpDir, ".SSH")
      mkdirSync(sshDir)
      const filePath = join(sshDir, "authorized_keys")
      writeFileSync(filePath, "ssh-rsa AAAA... ユーザー名@ホスト名")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it(".Aws ディレクトリ内のファイルはブロックされる", () => {
      tmpDir = makeTempDir()
      const awsDir = join(tmpDir, ".Aws")
      mkdirSync(awsDir)
      const filePath = join(awsDir, "credentials")
      writeFileSync(filePath, "[default]\naws_access_key_id=AKIAIOSFODNN7EXAMPLE")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })

    it("Secrets.json という名前のファイルは coscli/Secrets.json でブロックされる", () => {
      tmpDir = makeTempDir()
      const configDir = join(tmpDir, "coscli")
      mkdirSync(configDir)
      const secretsPath = join(configDir, "Secrets.json")
      writeFileSync(secretsPath, '{"default":"s%3A秘密のsid"}')
      expect(() => readFromFile(secretsPath)).toThrow(UnsafePathError)
    })

    it(".PEM 拡張子のファイルはブロックされる (サフィックスチェックは既に小文字対応済み)", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, "証明書.PEM")
      writeFileSync(filePath, "-----BEGIN CERTIFICATE-----")
      expect(() => readFromFile(filePath)).toThrow(UnsafePathError)
    })
  })

  describe("allowUnsafe フラグ", () => {
    it("allowUnsafe: true で禁止パスも読み込める", () => {
      tmpDir = makeTempDir()
      const filePath = join(tmpDir, ".env")
      writeFileSync(filePath, "TEST_KEY=テスト値")
      // allowUnsafe オプションで bypass できる
      expect(readFromFile(filePath, { allowUnsafe: true })).toBe("TEST_KEY=テスト値")
    })
  })
})

describe("readStdinBounded", () => {
  it("UnsafePathError クラスが正しく定義されている", () => {
    // UnsafePathError のコンストラクタが正しく動作することを確認
    const err = new UnsafePathError("/etc/passwd", "テスト用の理由")
    expect(err.filePath).toBe("/etc/passwd")
    expect(err.reason).toBe("テスト用の理由")
    expect(err.message).toContain("/etc/passwd")
    expect(err.message).toContain("テスト用の理由")
    expect(err.name).toBe("UnsafePathError")
    expect(err).toBeInstanceOf(Error)
  })

  it("readStdinBounded は関数としてエクスポートされている", () => {
    // readStdinBounded が存在することを確認 (stdin に書き込めないため動作テストは省略)
    expect(typeof readStdinBounded).toBe("function")
  })
})
