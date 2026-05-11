/**
 * version.test.ts — バージョン文字列の v-prefix 正規化ロジックのテスト。
 *
 * bun build --define 'VERSION="vX.Y.Z"' でタグ名 (v-prefix 付き) が注入されるため、
 * defineCommand の meta.version に渡す前に v-prefix を除去する必要がある。
 * citty の renderUsage が自動で "v" を付加するため、重複して "vvX.Y.Z" になるのを防ぐ。
 */

import { describe, expect, it } from "bun:test"
import { normalizeVersion } from "@/infra/version"

describe("normalizeVersion", () => {
  it("v-prefix 付きバージョンは prefix を除去して返す", () => {
    expect(normalizeVersion("v0.1.1")).toBe("0.1.1")
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3")
    expect(normalizeVersion("v10.20.30")).toBe("10.20.30")
  })

  it("v-prefix なしバージョンはそのまま返す", () => {
    expect(normalizeVersion("0.1.1")).toBe("0.1.1")
    expect(normalizeVersion("1.2.3")).toBe("1.2.3")
  })

  it("空文字はそのまま返す", () => {
    expect(normalizeVersion("")).toBe("")
  })
})
