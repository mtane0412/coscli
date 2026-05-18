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
  // テスト用設定ファイルを削除する
  try {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true })
  } catch {
    // クリーンアップ失敗は無視する
  }
})

describe("checkSandbox - グローバル設定 (agent.defaultEnableCommands)", () => {
  it("agent.defaultEnableCommands に含まれるコマンドは通過する", () => {
    writeTestConfig({ agent: { defaultEnableCommands: ["page.get", "page.list"] } })
    // page.get は許可リストに含まれるため通過する
    expect(() => checkSandbox("page.get", makeArgs())).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("agent.defaultEnableCommands に含まれないコマンドは exit 7 で拒否される", () => {
    writeTestConfig({ agent: { defaultEnableCommands: ["page.get", "page.list"] } })
    // page.delete は許可リストに含まれないため拒否される
    expect(() => checkSandbox("page.delete", makeArgs())).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("agent.defaultDisableCommands に含まれるコマンドは exit 7 で拒否される", () => {
    writeTestConfig({ agent: { defaultDisableCommands: ["page.delete"] } })
    // page.delete は禁止リストに含まれるため拒否される
    expect(() => checkSandbox("page.delete", makeArgs())).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("agent.defaultDisableCommands に含まれないコマンドは通過する", () => {
    writeTestConfig({ agent: { defaultDisableCommands: ["page.delete"] } })
    // page.get は禁止リストに含まれないため通過する
    expect(() => checkSandbox("page.get", makeArgs())).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })
})

describe("checkSandbox - プロジェクト固有設定", () => {
  it("projects.<name>.disableCommands に含まれるコマンドはそのプロジェクトで拒否される", () => {
    writeTestConfig({
      projects: { 読み取り専用プロジェクト: { disableCommands: ["page.delete", "page.new"] } },
    })
    // 読み取り専用プロジェクト向けの page.delete は拒否される
    expect(() =>
      checkSandbox("page.delete", makeArgs({ project: "読み取り専用プロジェクト" })),
    ).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("projects.<name>.disableCommands に含まれないコマンドは通過する", () => {
    writeTestConfig({
      projects: { 読み取り専用プロジェクト: { disableCommands: ["page.delete"] } },
    })
    // page.get は禁止リストに含まれないため通過する
    expect(() =>
      checkSandbox("page.get", makeArgs({ project: "読み取り専用プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("projects.<name>.enableCommands に含まれるコマンドのみ許可される", () => {
    writeTestConfig({
      projects: { 制限プロジェクト: { enableCommands: ["page.get", "page.list"] } },
    })
    // page.get は enable リストに含まれるため通過する
    expect(() => checkSandbox("page.get", makeArgs({ project: "制限プロジェクト" }))).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("projects.<name>.enableCommands に含まれないコマンドは拒否される", () => {
    writeTestConfig({
      projects: { 制限プロジェクト: { enableCommands: ["page.get", "page.list"] } },
    })
    // page.delete は enable リストに含まれないため拒否される
    expect(() => checkSandbox("page.delete", makeArgs({ project: "制限プロジェクト" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("プロジェクト設定がグローバルの agent.defaultDisableCommands を上書きする", () => {
    writeTestConfig({
      agent: { defaultDisableCommands: ["page.delete"] },
      projects: {
        // このプロジェクトでは page.delete を許可する (enableCommands で全許可)
        書き込み可能プロジェクト: { enableCommands: ["*"] },
      },
    })
    // グローバルでは page.delete 禁止だが、プロジェクト設定で全許可されているので通過する
    expect(() =>
      checkSandbox("page.delete", makeArgs({ project: "書き込み可能プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("プロジェクト設定がグローバルの agent.defaultEnableCommands を上書きする", () => {
    writeTestConfig({
      agent: { defaultEnableCommands: ["page.get"] },
      projects: {
        // このプロジェクトでは page.delete も許可する (上書き)
        上書きプロジェクト: { enableCommands: ["page.get", "page.delete"] },
      },
    })
    // グローバルでは page.delete は enable リスト外で拒否されるが、
    // プロジェクト固有で許可されているため通過する
    expect(() =>
      checkSandbox("page.delete", makeArgs({ project: "上書きプロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("別プロジェクトの制限は対象プロジェクト以外に影響しない", () => {
    writeTestConfig({
      projects: { 読み取り専用プロジェクト: { disableCommands: ["page.delete"] } },
    })
    // 別プロジェクトを指定した場合は制限が適用されない
    expect(() => checkSandbox("page.delete", makeArgs({ project: "別プロジェクト" }))).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })
})

describe("checkSandbox - COS_PROJECT 環境変数によるプロジェクト特定", () => {
  it("COS_PROJECT 環境変数でプロジェクトを指定してプロジェクト設定を適用できる", () => {
    writeTestConfig({
      projects: { 環境変数プロジェクト: { disableCommands: ["page.delete"] } },
    })
    process.env["COS_PROJECT"] = "環境変数プロジェクト"
    // COS_PROJECT 経由でプロジェクト設定が適用される
    expect(() => checkSandbox("page.delete", makeArgs())).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })
})

describe("checkSandbox - agent.defaultProjectPermission プリセット", () => {
  it('"read" プリセットが未設定プロジェクトの write コマンドを拒否する', () => {
    writeTestConfig({ agent: { defaultProjectPermission: "read" } })
    // 未設定プロジェクトの page.new は write 系コマンドなので read プリセットで拒否される
    expect(() => checkSandbox("page.new", makeArgs({ project: "未設定プロジェクト" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it('"read" プリセットが未設定プロジェクトの read コマンドを許可する', () => {
    writeTestConfig({ agent: { defaultProjectPermission: "read" } })
    // page.get は read 系コマンドなので通過する
    expect(() =>
      checkSandbox("page.get", makeArgs({ project: "未設定プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it('"none" プリセットが未設定プロジェクトの全コマンドを拒否する', () => {
    writeTestConfig({ agent: { defaultProjectPermission: "none" } })
    // read 系も write 系もすべて拒否される
    expect(() => checkSandbox("page.get", makeArgs({ project: "未設定プロジェクト" }))).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it('"readwrite" プリセットは全コマンドを許可する', () => {
    writeTestConfig({ agent: { defaultProjectPermission: "readwrite" } })
    // write 系コマンドも許可される
    expect(() =>
      checkSandbox("page.delete", makeArgs({ project: "未設定プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("明示的に設定されたプロジェクトには defaultProjectPermission が適用されない", () => {
    writeTestConfig({
      agent: { defaultProjectPermission: "read" },
      projects: {
        // 明示設定で全許可
        明示設定プロジェクト: { enableCommands: ["*"] },
      },
    })
    // 明示設定のプロジェクトには read プリセットが適用されず page.new も許可される
    expect(() =>
      checkSandbox("page.new", makeArgs({ project: "明示設定プロジェクト" })),
    ).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })
})

describe("checkSandbox - CLI フラグ優先度", () => {
  it("CLI --enable-commands フラグはプロジェクト設定より優先される", () => {
    writeTestConfig({
      projects: { 制限プロジェクト: { enableCommands: ["page.get"] } },
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
      projects: { 全許可プロジェクト: { enableCommands: ["*"] } },
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
})

describe("checkSandbox - プロジェクト未指定の場合", () => {
  it("プロジェクト未指定ではプロジェクト固有設定が適用されず全コマンドを許可する", () => {
    writeTestConfig({
      projects: { マイプロジェクト: { disableCommands: ["page.delete"] } },
    })
    // project が args にも env にもない場合は設定ファイルの projects を参照しない
    expect(() => checkSandbox("page.delete", makeArgs())).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it("プロジェクト未指定でも agent.defaultDisableCommands は適用される", () => {
    writeTestConfig({ agent: { defaultDisableCommands: ["page.delete"] } })
    // グローバル設定は project 未指定でも適用される
    expect(() => checkSandbox("page.delete", makeArgs())).toThrow()
    expect(exitMock).toHaveBeenCalledWith(7)
  })

  it("プロジェクト未指定では defaultProjectPermission が適用されない", () => {
    writeTestConfig({ agent: { defaultProjectPermission: "read" } })
    // project が指定されていないため read プリセットが適用されず write コマンドも許可される
    expect(() => checkSandbox("page.new", makeArgs())).not.toThrow()
    expect(exitMock).not.toHaveBeenCalled()
  })
})
