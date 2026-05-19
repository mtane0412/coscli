/**
 * cli-context.test.ts — applyRootContext() のテスト。
 *
 * ルートフラグ (--json / --plain / --results-only / --select /
 * --enable-commands / --disable-commands / --color) を評価して
 * 環境変数へ注入し、色設定を初期化する関数。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { applyRootContext } from "@/infra/cli-context"
import * as color from "@/infra/color"

let exitMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let initColorSpy: ReturnType<typeof spyOn>

/** テスト前に環境変数をクリアし、モックを設定する */
beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  initColorSpy = spyOn(color, "initColor").mockImplementation(() => {})

  // テスト間の環境変数汚染を防ぐ
  for (const key of [
    "COS_JSON",
    "COS_PLAIN",
    "COS_RESULTS_ONLY",
    "COS_SELECT",
    "COS_ENABLE_COMMANDS",
    "COS_DISABLE_COMMANDS",
  ]) {
    Reflect.deleteProperty(process.env, key)
  }
})

afterEach(() => {
  exitMock.mockRestore()
  stderrMock.mockRestore()
  initColorSpy.mockRestore()
})

describe("applyRootContext", () => {
  it("--json=true のとき COS_JSON='1' を環境変数にセットする", () => {
    applyRootContext({ json: true, plain: false, "results-only": false }, process.env)
    expect(process.env["COS_JSON"]).toBe("1")
  })

  it("--plain=true のとき COS_PLAIN='1' を環境変数にセットする", () => {
    applyRootContext({ json: false, plain: true, "results-only": false }, process.env)
    expect(process.env["COS_PLAIN"]).toBe("1")
  })

  it("--results-only=true のとき COS_RESULTS_ONLY='1' を環境変数にセットする", () => {
    applyRootContext({ json: false, plain: false, "results-only": true }, process.env)
    expect(process.env["COS_RESULTS_ONLY"]).toBe("1")
  })

  it("--select が指定されたとき COS_SELECT を環境変数にセットする", () => {
    applyRootContext(
      { json: false, plain: false, "results-only": false, select: "pages[].title" },
      process.env,
    )
    expect(process.env["COS_SELECT"]).toBe("pages[].title")
  })

  it("--enable-commands が指定されたとき COS_ENABLE_COMMANDS を環境変数にセットする", () => {
    applyRootContext(
      { json: false, plain: false, "results-only": false, "enable-commands": "page.get,page.list" },
      process.env,
    )
    expect(process.env["COS_ENABLE_COMMANDS"]).toBe("page.get,page.list")
  })

  it("--disable-commands が指定されたとき COS_DISABLE_COMMANDS を環境変数にセットする", () => {
    applyRootContext(
      { json: false, plain: false, "results-only": false, "disable-commands": "page.delete" },
      process.env,
    )
    expect(process.env["COS_DISABLE_COMMANDS"]).toBe("page.delete")
  })

  it("--json と --plain を同時に指定した場合は exit 5 で終了する", () => {
    try {
      applyRootContext({ json: true, plain: true, "results-only": false }, process.env)
    } catch {
      // process.exit モック後の throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("initColor が color フラグで呼ばれる", () => {
    applyRootContext(
      { json: false, plain: false, "results-only": false, color: "always" },
      process.env,
    )
    expect(initColorSpy).toHaveBeenCalledWith("always")
  })

  it("color フラグ未指定のときは 'auto' で initColor を呼ぶ", () => {
    applyRootContext({ json: false, plain: false, "results-only": false }, process.env)
    expect(initColorSpy).toHaveBeenCalledWith("auto")
  })
})
