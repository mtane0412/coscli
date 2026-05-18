/**
 * sandbox-policy.test.ts — checkSandbox の config 連携テスト。
 *
 * 設定ファイル経由のグローバル / プロジェクト単位の
 * コマンド許可・拒否ポリシーを検証する。
 *
 * テスト設計:
 *  - XDG_CONFIG_HOME を一時ディレクトリに向け、saveConfig でテスト用設定を書き込む
 *  - process.exit をモックして exit code をキャプチャする
 *  - 各テスト後に環境変数と mock をクリアする
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CommonArgs } from "@/commands/_shared"
import { checkSandbox } from "@/commands/_shared"
import type { CoscliConfig } from "@/infra/config"
import { saveConfig } from "@/infra/config"

/** 一時設定ディレクトリ */
const TEST_CONFIG_DIR = join(tmpdir(), `coscli-sandbox-policy-test-${Date.now()}`)
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, "coscli", "config.json5")

/** テスト用デフォルト CommonArgs を生成するヘルパー */
function makeArgs(overrides: Partial<CommonArgs> = {}): CommonArgs {
  return {
    json: false,
    plain: false,
    "results-only": false,
    quiet: false,
    ...overrides,
  }
}

/**
 * テスト用設定ファイルを書き込む。
 * XDG_CONFIG_HOME を TEST_CONFIG_DIR に向けることで loadConfig() に読み込ませる。
 */
function writeTestConfig(config: CoscliConfig): void {
  saveConfig(config, TEST_CONFIG_FILE)
}

let exitMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

beforeEach(() => {
  process.env["XDG_CONFIG_HOME"] = TEST_CONFIG_DIR
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
})

afterEach(() => {
  exitMock.mockRestore()
  stderrMock.mockRestore()
  Reflect.deleteProperty(process.env, "XDG_CONFIG_HOME")
  try {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true })
  } catch {
    // クリーンアップ失敗は無視する
  }
})

describe("checkSandbox - グローバル disableCommands", () => {
  it("disableCommands に含まれるコマンドは exit 7 で拒否される", () => {
    writeTestConfig({ disableCommands: ["page.delete"] })
    expect(() => checkSandbox("page.delete", makeArgs())).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("disableCommands に含まれないコマンドは通過する", () => {
    writeTestConfig({ disableCommands: ["page.delete"] })
    expect(() => checkSandbox("page.get", makeArgs())).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("disableCommands はプロジェクト指定なしでも適用される", () => {
    writeTestConfig({ disableCommands: ["page.delete"] })
    expect(() => checkSandbox("page.delete", makeArgs())).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("disableCommands はプロジェクト permission: readwrite でも適用される", () => {
    writeTestConfig({
      disableCommands: ["page.delete"],
      projects: { 全許可プロジェクト: { permission: "readwrite" } },
    })
    // readwrite でも disableCommands は絶対禁止リストとして機能する
    expect(() => checkSandbox("page.delete", makeArgs({ project: "全許可プロジェクト" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})

describe("checkSandbox - プロジェクト固有 permission", () => {
  it("projects.<name>.permission: read が write コマンドを拒否する", () => {
    writeTestConfig({ projects: { 読み取り専用: { permission: "read" } } })
    expect(() => checkSandbox("page.new", makeArgs({ project: "読み取り専用" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("projects.<name>.permission: read が read コマンドを許可する", () => {
    writeTestConfig({ projects: { 読み取り専用: { permission: "read" } } })
    expect(() => checkSandbox("page.get", makeArgs({ project: "読み取り専用" }))).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("projects.<name>.permission: readwrite が全コマンドを許可する", () => {
    writeTestConfig({ projects: { 全許可プロジェクト: { permission: "readwrite" } } })
    expect(() =>
      checkSandbox("page.delete", makeArgs({ project: "全許可プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("projects.<name>.permission: none が全コマンドを拒否する", () => {
    writeTestConfig({ projects: { 完全ブロック: { permission: "none" } } })
    expect(() => checkSandbox("page.get", makeArgs({ project: "完全ブロック" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("projects.<name>.disableCommands に含まれるコマンドはそのプロジェクトで拒否される", () => {
    writeTestConfig({
      projects: { 読み取り専用プロジェクト: { disableCommands: ["page.delete", "page.new"] } },
    })
    expect(() =>
      checkSandbox("page.delete", makeArgs({ project: "読み取り専用プロジェクト" })),
    ).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("projects.<name>.enableCommands に含まれないコマンドは拒否される", () => {
    writeTestConfig({
      projects: { 制限プロジェクト: { enableCommands: ["page.get", "page.list"] } },
    })
    expect(() => checkSandbox("page.delete", makeArgs({ project: "制限プロジェクト" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("projects.<name>.enableCommands に含まれるコマンドは許可される", () => {
    writeTestConfig({
      projects: { 制限プロジェクト: { enableCommands: ["page.get", "page.list"] } },
    })
    expect(() => checkSandbox("page.get", makeArgs({ project: "制限プロジェクト" }))).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("別プロジェクトの制限は対象プロジェクト以外に影響しない", () => {
    writeTestConfig({
      projects: { 読み取り専用プロジェクト: { permission: "read" } },
    })
    expect(() => checkSandbox("page.delete", makeArgs({ project: "別プロジェクト" }))).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })
})

describe("checkSandbox - defaultPermission (未設定プロジェクトの既定権限)", () => {
  it("defaultPermission: read が未設定プロジェクトの write コマンドを拒否する", () => {
    writeTestConfig({ defaultPermission: "read" })
    expect(() => checkSandbox("page.new", makeArgs({ project: "未設定プロジェクト" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("defaultPermission: read が未設定プロジェクトの read コマンドを許可する", () => {
    writeTestConfig({ defaultPermission: "read" })
    expect(() =>
      checkSandbox("page.get", makeArgs({ project: "未設定プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("defaultPermission: none が未設定プロジェクトの全コマンドを拒否する", () => {
    writeTestConfig({ defaultPermission: "none" })
    expect(() => checkSandbox("page.get", makeArgs({ project: "未設定プロジェクト" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("defaultPermission: readwrite が未設定プロジェクトの全コマンドを許可する", () => {
    writeTestConfig({ defaultPermission: "readwrite" })
    expect(() =>
      checkSandbox("page.delete", makeArgs({ project: "未設定プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("明示的に設定されたプロジェクトには defaultPermission が適用されない", () => {
    writeTestConfig({
      defaultPermission: "read",
      projects: {
        // 明示設定で全許可
        明示設定プロジェクト: { permission: "readwrite" },
      },
    })
    // 明示設定のプロジェクトには defaultPermission が適用されず page.new も許可される
    expect(() =>
      checkSandbox("page.new", makeArgs({ project: "明示設定プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("プロジェクト未指定では defaultPermission が適用されない", () => {
    writeTestConfig({ defaultPermission: "read" })
    // project が指定されていないため defaultPermission が適用されず write コマンドも許可される
    expect(() => checkSandbox("page.new", makeArgs())).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })
})

describe("checkSandbox - COS_PROJECT 環境変数", () => {
  it("COS_PROJECT 環境変数でプロジェクトを指定してプロジェクト設定を適用できる", () => {
    writeTestConfig({
      projects: { 環境変数プロジェクト: { permission: "read" } },
    })
    process.env["COS_PROJECT"] = "環境変数プロジェクト"
    expect(() => checkSandbox("page.delete", makeArgs())).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})

describe("checkSandbox - CLI フラグ優先度", () => {
  it("CLI --enable-commands フラグはプロジェクト設定より優先される", () => {
    writeTestConfig({
      projects: { 制限プロジェクト: { permission: "read" } },
    })
    // CLI フラグで page.delete を明示的に許可する
    expect(() =>
      checkSandbox(
        "page.delete",
        makeArgs({ project: "制限プロジェクト", "enable-commands": "page.delete" }),
      ),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("CLI --disable-commands フラグはプロジェクト設定より優先される", () => {
    writeTestConfig({
      projects: { 全許可プロジェクト: { permission: "readwrite" } },
    })
    // プロジェクトは全許可だが CLI フラグで page.delete を禁止する
    expect(() =>
      checkSandbox(
        "page.delete",
        makeArgs({ project: "全許可プロジェクト", "disable-commands": "page.delete" }),
      ),
    ).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("CLI --enable-commands フラグはグローバル disableCommands より優先される", () => {
    writeTestConfig({ disableCommands: ["page.delete"] })
    // CLI フラグで page.delete を明示的に許可する
    expect(() =>
      checkSandbox("page.delete", makeArgs({ "enable-commands": "page.delete" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })
})

describe("checkSandbox - プロジェクト未指定", () => {
  it("プロジェクト未指定ではプロジェクト固有設定が適用されず全コマンドを許可する", () => {
    writeTestConfig({
      projects: { マイプロジェクト: { permission: "read" } },
    })
    // project が args にも env にもない場合は設定ファイルの projects を参照しない
    expect(() => checkSandbox("page.delete", makeArgs())).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("プロジェクト未指定でも disableCommands は適用される", () => {
    writeTestConfig({ disableCommands: ["page.delete"] })
    expect(() => checkSandbox("page.delete", makeArgs())).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})
