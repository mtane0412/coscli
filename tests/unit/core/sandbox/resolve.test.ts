/**
 * sandbox/resolve.test.ts — resolvePolicy() 純粋関数のテスト。
 *
 * 優先順位: CLI フラグ > 環境変数 > プロジェクト固有設定 > defaultPermission > 全許可
 * checkSandbox の現在挙動を 8 ケース程度テーブル化し、振る舞いを固定する。
 */

import { describe, expect, it } from "bun:test"
import { resolvePolicy } from "@/core/sandbox/resolve"
import type { CoscliConfig } from "@/infra/config"

/** テスト用の空 config を返すヘルパー */
function emptyConfig(): CoscliConfig {
  return {}
}

describe("resolvePolicy", () => {
  it("すべて未指定の場合は enableStr / disableStr ともに undefined を返す", () => {
    const result = resolvePolicy({
      cli: {},
      env: {},
      config: emptyConfig(),
    })
    expect(result.enableStr).toBeUndefined()
    expect(result.disableStr).toBeUndefined()
  })

  it("CLI --enable-commands が指定された場合は enableStr にセットされる", () => {
    const result = resolvePolicy({
      cli: { enable: "page.get,page.list" },
      env: {},
      config: emptyConfig(),
    })
    expect(result.enableStr).toBe("page.get,page.list")
    expect(result.disableStr).toBeUndefined()
  })

  it("CLI --disable-commands が指定された場合は disableStr にセットされる", () => {
    const result = resolvePolicy({
      cli: { disable: "page.delete" },
      env: {},
      config: emptyConfig(),
    })
    expect(result.enableStr).toBeUndefined()
    expect(result.disableStr).toBe("page.delete")
  })

  it("環境変数 COS_ENABLE_COMMANDS が指定された場合は enableStr にセットされる", () => {
    const result = resolvePolicy({
      cli: {},
      env: { COS_ENABLE_COMMANDS: "page.get" },
      config: emptyConfig(),
    })
    expect(result.enableStr).toBe("page.get")
  })

  it("CLI フラグが環境変数より優先される", () => {
    const result = resolvePolicy({
      cli: { enable: "page.list" },
      env: { COS_ENABLE_COMMANDS: "page.get" },
      config: emptyConfig(),
    })
    // CLI が優先されるため CLI の値が使われる
    expect(result.enableStr).toBe("page.list")
  })

  it("CLI/env が指定された場合は config を無視する", () => {
    const result = resolvePolicy({
      cli: { enable: "page.get", project: "テストプロジェクト" },
      env: {},
      config: {
        projects: {
          テストプロジェクト: {
            permission: "none",
          },
        },
        disableCommands: ["page.delete"],
      },
    })
    // CLI フラグが指定されているため config の permission も disableCommands も無視
    expect(result.enableStr).toBe("page.get")
    expect(result.disableStr).toBeUndefined()
  })

  it("プロジェクト固有の permission プリセットが展開される", () => {
    const result = resolvePolicy({
      cli: { project: "テストプロジェクト" },
      env: {},
      config: {
        projects: {
          テストプロジェクト: {
            permission: "read",
          },
        },
      },
    })
    // "read" プリセットは読み取り系を enable にする
    expect(result.enableStr).toBeDefined()
    expect(result.enableStr).toContain("page.get")
  })

  it("プロジェクト固有の permission + enableCommands が合成される", () => {
    const result = resolvePolicy({
      cli: { project: "テストプロジェクト" },
      env: {},
      config: {
        projects: {
          テストプロジェクト: {
            permission: "read",
            enableCommands: ["page.append"],
          },
        },
      },
    })
    // read プリセット + page.append の追加
    expect(result.enableStr).toContain("page.append")
  })

  it("プロジェクト固有の permission + disableCommands が合成される", () => {
    const result = resolvePolicy({
      cli: { project: "テストプロジェクト" },
      env: {},
      config: {
        projects: {
          テストプロジェクト: {
            permission: "readwrite",
            disableCommands: ["page.delete"],
          },
        },
      },
    })
    // readwrite プリセット上に page.delete を disable として追加
    expect(result.disableStr).toContain("page.delete")
  })

  it("プロジェクト未指定かつ defaultPermission が設定されている場合は無効 (プロジェクト指定時のみ有効)", () => {
    const result = resolvePolicy({
      cli: {},
      env: {},
      config: {
        defaultPermission: "read",
      },
    })
    // プロジェクト名がないので defaultPermission は適用されない
    expect(result.enableStr).toBeUndefined()
    expect(result.disableStr).toBeUndefined()
  })

  it("プロジェクト指定あり + config.defaultPermission が展開される", () => {
    const result = resolvePolicy({
      cli: { project: "未設定プロジェクト" },
      env: {},
      config: {
        defaultPermission: "read",
      },
    })
    // projects に "未設定プロジェクト" はないが defaultPermission が適用される
    expect(result.enableStr).toBeDefined()
  })

  it("CLI/env 未指定時に config.disableCommands が重ねて適用される", () => {
    const result = resolvePolicy({
      cli: { project: "テストプロジェクト" },
      env: {},
      config: {
        projects: {
          テストプロジェクト: {
            permission: "readwrite",
          },
        },
        disableCommands: ["page.delete"],
      },
    })
    // プロジェクト設定後に全体 disableCommands も追加される
    expect(result.disableStr).toContain("page.delete")
  })

  it("CLI/env 指定時は config.disableCommands を無視する", () => {
    const result = resolvePolicy({
      cli: { enable: "page.get" },
      env: {},
      config: {
        disableCommands: ["page.delete"],
      },
    })
    // CLI フラグが指定されているため config.disableCommands は無視
    expect(result.disableStr).toBeUndefined()
  })

  it("enableCommands のみのプロジェクト設定 (permission なし) が展開される", () => {
    const result = resolvePolicy({
      cli: { project: "テストプロジェクト" },
      env: {},
      config: {
        projects: {
          テストプロジェクト: {
            enableCommands: ["page.get", "page.list"],
          },
        },
      },
    })
    expect(result.enableStr).toBe("page.get,page.list")
    expect(result.disableStr).toBeUndefined()
  })
})
