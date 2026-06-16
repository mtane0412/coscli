/**
 * command-classification.test.ts — コマンドの read/write 分類テーブルと
 * プリセット展開関数のテスト。
 */

import { describe, expect, it } from "bun:test"
import {
  READ_COMMANDS,
  WRITE_COMMANDS,
  expandPermissionPreset,
} from "@/core/command-classification"

describe("READ_COMMANDS", () => {
  it("ページ取得系コマンドを含む", () => {
    expect(READ_COMMANDS).toContain("page.get")
    expect(READ_COMMANDS).toContain("page.list")
    expect(READ_COMMANDS).toContain("page.text")
    expect(READ_COMMANDS).toContain("page.code")
    expect(READ_COMMANDS).toContain("page.context")
    expect(READ_COMMANDS).toContain("page.table")
    expect(READ_COMMANDS).toContain("page.url")
    expect(READ_COMMANDS).toContain("page.watch")
    expect(READ_COMMANDS).toContain("page.line.get")
  })

  it("プロジェクト取得系コマンドを含む", () => {
    expect(READ_COMMANDS).toContain("project.info")
    expect(READ_COMMANDS).toContain("project.list")
    expect(READ_COMMANDS).toContain("project.graph")
  })

  it("ユーティリティ系読み取りコマンドを含む", () => {
    expect(READ_COMMANDS).toContain("search")
    expect(READ_COMMANDS).toContain("auth.whoami")
    expect(READ_COMMANDS).toContain("config.get")
    expect(READ_COMMANDS).toContain("config.path")
    expect(READ_COMMANDS).toContain("schema")
    expect(READ_COMMANDS).toContain("exit-codes")
    expect(READ_COMMANDS).toContain("notation")
    expect(READ_COMMANDS).toContain("convert")
    expect(READ_COMMANDS).toContain("sync.diff")
    expect(READ_COMMANDS).toContain("sync.pull")
  })

  it("page.icon は API 呼び出しなし・URL 生成のみのため READ に含む", () => {
    // page.icon は WRITE 分類の誤りだったため READ に移送 (codex review 指摘 #9)
    expect(READ_COMMANDS).toContain("page.icon")
  })

  it("書き込みコマンドを含まない", () => {
    expect(READ_COMMANDS).not.toContain("page.new")
    expect(READ_COMMANDS).not.toContain("page.delete")
    expect(READ_COMMANDS).not.toContain("page.edit.preview")
    expect(READ_COMMANDS).not.toContain("page.edit.submit")
    expect(READ_COMMANDS).not.toContain("page.append")
    expect(READ_COMMANDS).not.toContain("page.prepend")
    expect(READ_COMMANDS).not.toContain("page.insert")
    expect(READ_COMMANDS).not.toContain("page.rename")
    expect(READ_COMMANDS).not.toContain("page.line.replace")
    expect(READ_COMMANDS).not.toContain("page.line.delete")
    expect(READ_COMMANDS).not.toContain("page.pin")
    expect(READ_COMMANDS).not.toContain("page.unpin")
    expect(READ_COMMANDS).not.toContain("auth.login")
    expect(READ_COMMANDS).not.toContain("auth.logout")
    expect(READ_COMMANDS).not.toContain("config.set")
    expect(READ_COMMANDS).not.toContain("sync.push")
    expect(READ_COMMANDS).not.toContain("serve.rest")
  })
})

describe("WRITE_COMMANDS", () => {
  it("READ_COMMANDS と重複しない", () => {
    const overlap = READ_COMMANDS.filter((command) =>
      (WRITE_COMMANDS as readonly string[]).includes(command),
    )
    expect(overlap).toHaveLength(0)
  })

  it("page.icon は READ に移送されたため WRITE に含まない", () => {
    // page.icon は URL 生成のみで Cosense API を呼ばないため READ が正しい分類
    expect(WRITE_COMMANDS).not.toContain("page.icon")
  })

  it("ページ書き込み系コマンドを含む", () => {
    expect(WRITE_COMMANDS).toContain("page.new.preview")
    expect(WRITE_COMMANDS).toContain("page.delete")
    expect(WRITE_COMMANDS).toContain("page.edit.preview")
    expect(WRITE_COMMANDS).toContain("page.edit.submit")
    expect(WRITE_COMMANDS).toContain("page.append.preview")
    expect(WRITE_COMMANDS).toContain("page.prepend.preview")
    expect(WRITE_COMMANDS).toContain("page.insert.preview")
    expect(WRITE_COMMANDS).toContain("page.rename")
    expect(WRITE_COMMANDS).toContain("page.line.replace.preview")
    expect(WRITE_COMMANDS).toContain("page.line.delete.preview")
    expect(WRITE_COMMANDS).toContain("page.pin")
    expect(WRITE_COMMANDS).toContain("page.unpin")
  })

  it("認証・設定・同期系書き込みコマンドを含む", () => {
    expect(WRITE_COMMANDS).toContain("auth.login")
    expect(WRITE_COMMANDS).toContain("auth.logout")
    expect(WRITE_COMMANDS).toContain("config.set")
    expect(WRITE_COMMANDS).toContain("sync.push")
    expect(WRITE_COMMANDS).toContain("serve.rest")
  })

  it("読み取りコマンドを含まない", () => {
    expect(WRITE_COMMANDS).not.toContain("page.get")
    expect(WRITE_COMMANDS).not.toContain("page.list")
    expect(WRITE_COMMANDS).not.toContain("search")
    expect(WRITE_COMMANDS).not.toContain("auth.whoami")
  })
})

describe("expandPermissionPreset", () => {
  it('"read" プリセットは read 系コマンドのみを enable に展開する', () => {
    const result = expandPermissionPreset("read")
    // enable に read コマンドが含まれる
    expect(result.enable).toContain("page.get")
    expect(result.enable).toContain("page.list")
    expect(result.enable).toContain("search")
    // write コマンドは含まれない
    expect(result.enable).not.toContain("page.delete")
    expect(result.enable).not.toContain("page.new")
    // disable は指定しない
    expect(result.disable).toBeUndefined()
  })

  it('"readwrite" プリセットは全コマンドを enable する', () => {
    const result = expandPermissionPreset("readwrite")
    // * で全許可
    expect(result.enable).toContain("*")
    expect(result.disable).toBeUndefined()
  })

  it('"none" プリセットは全コマンドを disable する', () => {
    const result = expandPermissionPreset("none")
    // enable は制限なし、disable で全拒否
    expect(result.enable).toBeUndefined()
    expect(result.disable).toContain("*")
  })
})
