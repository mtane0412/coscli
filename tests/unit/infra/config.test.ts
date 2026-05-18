/**
 * config.test.ts — infra/config の単体テスト。
 *
 * ファイルシステムへの副作用は tmp ディレクトリに限定し、
 * テスト終了後にクリーンアップする。
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, statSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  defaultConfigPath,
  getConfigValue,
  loadConfig,
  saveConfig,
  setConfigValue,
} from "@/infra/config"

/** テスト用の一時ファイルパスを生成する */
function tmpConfigPath(): string {
  return join(tmpdir(), `coscli-config-test-${Date.now()}.json5`)
}

describe("defaultConfigPath", () => {
  it("XDG_CONFIG_HOME が設定されている場合はそのパスを使う", () => {
    const original = process.env["XDG_CONFIG_HOME"]
    process.env["XDG_CONFIG_HOME"] = "/カスタム設定ディレクトリ"
    const result = defaultConfigPath()
    expect(result).toBe("/カスタム設定ディレクトリ/coscli/config.json5")
    process.env["XDG_CONFIG_HOME"] = original
  })
})

describe("loadConfig", () => {
  it("設定ファイルが存在しない場合は空オブジェクトを返す", () => {
    const result = loadConfig("/存在しないパス/config.json5")
    expect(result).toEqual({})
  })

  it("正しいJSON5ファイルを読み込んで設定を返す", () => {
    const path = tmpConfigPath()
    saveConfig({ defaultProject: "テストプロジェクト" }, path)
    const result = loadConfig(path)
    expect(result.defaultProject).toBe("テストプロジェクト")
    unlinkSync(path)
  })

  it("不正なJSON5ファイルの場合はエラーをスローする", () => {
    const path = tmpConfigPath()
    Bun.write(path, "{ 不正なJSON5 :")
    expect(() => loadConfig(path)).toThrow("設定ファイルの読み込みに失敗しました")
    unlinkSync(path)
  })
})

describe("saveConfig", () => {
  let path: string

  beforeEach(() => {
    path = tmpConfigPath()
  })

  afterEach(() => {
    if (existsSync(path)) unlinkSync(path)
  })

  it("設定をファイルに保存して読み込めること", () => {
    saveConfig({ defaultProject: "マイプロジェクト", defaultProfile: "work" }, path)
    const loaded = loadConfig(path)
    expect(loaded.defaultProject).toBe("マイプロジェクト")
    expect(loaded.defaultProfile).toBe("work")
  })

  it("ディレクトリが存在しない場合は自動作成する", () => {
    const nestedPath = join(tmpdir(), `coscli-nested-${Date.now()}`, "config.json5")
    saveConfig({ defaultProject: "ネストテスト" }, nestedPath)
    const loaded = loadConfig(nestedPath)
    expect(loaded.defaultProject).toBe("ネストテスト")
    unlinkSync(nestedPath)
  })

  it("保存されたファイルのパーミッションが 0o600 であること", () => {
    saveConfig({ defaultProject: "パーミッションテスト" }, path)
    const stat = statSync(path)
    // 下位 9 ビットでファイルパーミッションを確認する
    const mode = stat.mode & 0o777
    expect(mode).toBe(0o600)
  })
})

describe("getConfigValue", () => {
  const config = {
    defaultProject: "テストプロジェクト",
    output: { color: "always" as const },
    projects: {
      myproject: { defaultSort: "updated" },
    },
  }

  it("トップレベルのキーを取得できる", () => {
    expect(getConfigValue(config, "defaultProject")).toBe("テストプロジェクト")
  })

  it("ネストしたキーをドット区切りで取得できる", () => {
    expect(getConfigValue(config, "output.color")).toBe("always")
  })

  it("存在しないキーは undefined を返す", () => {
    expect(getConfigValue(config, "存在しないキー")).toBeUndefined()
  })

  it("ネストしたキーが存在しない場合は undefined を返す", () => {
    expect(getConfigValue(config, "output.存在しない")).toBeUndefined()
  })
})

describe("setConfigValue", () => {
  it("トップレベルのキーを設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "defaultProject", "新プロジェクト")
    expect(updated.defaultProject).toBe("新プロジェクト")
  })

  it("ネストしたキーをドット区切りで設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "output.color", "never")
    expect(updated.output?.color).toBe("never")
  })

  it("既存の設定を上書きできる", () => {
    const config = { defaultProject: "古いプロジェクト" }
    const updated = setConfigValue(config, "defaultProject", "新プロジェクト")
    expect(updated.defaultProject).toBe("新プロジェクト")
  })

  it("元のオブジェクトを変更しない（イミュータブル）", () => {
    const config = { defaultProject: "元のプロジェクト" }
    setConfigValue(config, "defaultProject", "新プロジェクト")
    expect(config.defaultProject).toBe("元のプロジェクト")
  })

  it("スキーマに合わない値はエラーをスローする", () => {
    const config = {}
    // output.color は "auto"|"always"|"never" のみ許可
    expect(() => setConfigValue(config, "output.color", "invalid")).toThrow()
  })

  it("sync.dir をドット区切りで設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "sync.dir", "/tmp/sync")
    expect(updated.sync?.dir).toBe("/tmp/sync")
  })

  it("sync.format に txt を設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "sync.format", "txt")
    expect(updated.sync?.format).toBe("txt")
  })

  it("sync.retries に数値を設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "sync.retries", 3)
    expect(updated.sync?.retries).toBe(3)
  })

  it("sync.format に不正な値を設定するとエラーになる", () => {
    const config = {}
    expect(() => setConfigValue(config, "sync.format", "md")).toThrow()
  })
})

describe("setConfigValue - 新規 sandbox 設定フィールド", () => {
  it("agent.defaultEnableCommands にコマンドリストを設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "agent.defaultEnableCommands", ["page.get", "page.list"])
    expect(updated.agent?.defaultEnableCommands).toEqual(["page.get", "page.list"])
  })

  it("agent.defaultProjectPermission に read を設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "agent.defaultProjectPermission", "read")
    expect(updated.agent?.defaultProjectPermission).toBe("read")
  })

  it("agent.defaultProjectPermission に readwrite を設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "agent.defaultProjectPermission", "readwrite")
    expect(updated.agent?.defaultProjectPermission).toBe("readwrite")
  })

  it("agent.defaultProjectPermission に none を設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "agent.defaultProjectPermission", "none")
    expect(updated.agent?.defaultProjectPermission).toBe("none")
  })

  it("agent.defaultProjectPermission に不正な値を設定するとエラーになる", () => {
    const config = {}
    expect(() => setConfigValue(config, "agent.defaultProjectPermission", "admin")).toThrow()
  })

  it("projects.<name>.enableCommands にコマンドリストを設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "projects.マイプロジェクト.enableCommands", ["page.get"])
    expect(updated.projects?.["マイプロジェクト"]?.enableCommands).toEqual(["page.get"])
  })

  it("projects.<name>.disableCommands にコマンドリストを設定できる", () => {
    const config = {}
    const updated = setConfigValue(config, "projects.マイプロジェクト.disableCommands", [
      "page.delete",
    ])
    expect(updated.projects?.["マイプロジェクト"]?.disableCommands).toEqual(["page.delete"])
  })
})

describe("prototype 汚染への防御", () => {
  afterAll(() => {
    // RED フェーズで汚染が発生した場合に備えてクリーンアップする
    Reflect.deleteProperty(Object.prototype, "polluted")
  })

  it("setConfigValue で __proto__ キーを指定すると throw する", () => {
    expect(() => setConfigValue({}, "__proto__.polluted", true)).toThrow()
  })

  it("setConfigValue で prototype キーを指定すると throw する", () => {
    expect(() => setConfigValue({}, "prototype.polluted", true)).toThrow()
  })

  it("setConfigValue で constructor キーを指定すると throw する", () => {
    expect(() => setConfigValue({}, "constructor.name", "不正コード")).toThrow()
  })

  it("__proto__ への setConfigValue が失敗しても Object.prototype が汚染されない", () => {
    try {
      setConfigValue({}, "__proto__.polluted", true)
    } catch {
      // 期待通りの throw
    }
    // Object.prototype が汚染されていないことを確認する
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
  })

  it("getConfigValue で __proto__ キーを指定すると undefined を返す", () => {
    const config = {}
    expect(getConfigValue(config, "__proto__")).toBeUndefined()
    expect(getConfigValue(config, "__proto__.polluted")).toBeUndefined()
  })

  it("getConfigValue で constructor キーを指定すると undefined を返す", () => {
    const config = {}
    expect(getConfigValue(config, "constructor")).toBeUndefined()
  })
})
