/**
 * resolve-version.test.ts — ビルドスクリプトのバージョン解決ロジックのテスト。
 *
 * resolveVersion は以下の優先順位でバージョンを決定する:
 * 1. 環境変数 VERSION が設定されている場合はその値を使用
 * 2. 設定されていない場合は package.json の version フィールドを使用
 * 3. どちらも取得できない場合は "dev" にフォールバック
 */

import { describe, expect, it } from "bun:test"
import { resolveVersion } from "../../../scripts/resolve-version"

describe("resolveVersion", () => {
  it("環境変数 VERSION が設定されている場合はその値を返す", () => {
    // ビルド時に CI から VERSION=v1.2.3 のように渡された場合
    expect(resolveVersion("v1.2.3", "0.1.1")).toBe("v1.2.3")
  })

  it("環境変数 VERSION が未設定 (undefined) の場合は package.json のバージョンを返す", () => {
    // bun run build を環境変数なしで実行した場合
    expect(resolveVersion(undefined, "0.1.1")).toBe("0.1.1")
  })

  it("環境変数 VERSION が空文字の場合は package.json のバージョンを返す", () => {
    // VERSION= のように空で渡された場合
    expect(resolveVersion("", "0.1.1")).toBe("0.1.1")
  })

  it("環境変数 VERSION が未設定かつ package.json バージョンも未定義の場合は dev を返す", () => {
    // 異常系: package.json の version が取得できない場合
    expect(resolveVersion(undefined, undefined)).toBe("dev")
  })

  it("環境変数 VERSION が空白のみの場合は package.json のバージョンを返す", () => {
    // VERSION='   ' のように空白のみで渡された設定ミスのケース
    expect(resolveVersion("   ", "0.1.1")).toBe("0.1.1")
  })

  it("package.json バージョンが空白のみの場合は dev を返す", () => {
    // package.json の version が空白のみの場合
    expect(resolveVersion(undefined, "   ")).toBe("dev")
  })
})
