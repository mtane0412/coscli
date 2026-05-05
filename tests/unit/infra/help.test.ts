/**
 * src/infra/help.ts のユニットテスト。
 *
 * resolveCommandPath: rawArgs からコマンドパスを再構築する関数
 * renderUsageForArgs: rawArgs からヘルプ文字列を生成する純関数
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { renderUsageForArgs, resolveCommandPath } from "@/infra/help"
import { defineCommand } from "citty"

// テスト用コマンドツリーの構築
const pageListCmd = defineCommand({
  meta: { description: "ページ一覧を取得する" },
  args: {
    project: { type: "string", description: "プロジェクト名" },
  },
  run: () => {},
})

const pageGetCmd = defineCommand({
  meta: { description: "ページを取得する" },
  run: () => {},
})

const pageCmd = defineCommand({
  meta: { description: "ページ操作コマンド" },
  subCommands: {
    list: pageListCmd,
    ls: pageListCmd,
    get: pageGetCmd,
  },
})

const searchCmd = defineCommand({
  meta: { description: "ページを検索する" },
  run: () => {},
})

const rootCmd = defineCommand({
  meta: { name: "cos", description: "Cosense CLI" },
  subCommands: {
    page: pageCmd,
    search: searchCmd,
    find: searchCmd,
  },
})

describe("resolveCommandPath", () => {
  test("引数なし: ルートコマンドを返す", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", [])
    expect(result.pathSegments).toEqual(["cos"])
    expect(Object.is(result.cmd, rootCmd)).toBe(true)
  })

  test("--help のみ: ルートコマンドを返す", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["--help"])
    expect(result.pathSegments).toEqual(["cos"])
    expect(Object.is(result.cmd, rootCmd)).toBe(true)
  })

  test("グループコマンド: pageCmd を返す", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["page"])
    expect(result.pathSegments).toEqual(["cos", "page"])
    expect(Object.is(result.cmd, pageCmd)).toBe(true)
  })

  test("グループコマンド + --help: pageCmd を返す", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["page", "--help"])
    expect(result.pathSegments).toEqual(["cos", "page"])
    expect(Object.is(result.cmd, pageCmd)).toBe(true)
  })

  test("3階層: pageListCmd を返す", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["page", "list"])
    expect(result.pathSegments).toEqual(["cos", "page", "list"])
    expect(Object.is(result.cmd, pageListCmd)).toBe(true)
  })

  test("3階層 + --help: pageListCmd を返す", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["page", "list", "--help"])
    expect(result.pathSegments).toEqual(["cos", "page", "list"])
    expect(Object.is(result.cmd, pageListCmd)).toBe(true)
  })

  test("フラグ混じり: フラグをスキップして pageListCmd を返す", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", [
      "page",
      "list",
      "--project",
      "foo",
      "--help",
    ])
    expect(result.pathSegments).toEqual(["cos", "page", "list"])
    expect(Object.is(result.cmd, pageListCmd)).toBe(true)
  })

  test("--help が先頭: page を後方から解決する", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["--help", "page"])
    expect(result.pathSegments).toEqual(["cos", "page"])
    expect(Object.is(result.cmd, pageCmd)).toBe(true)
  })

  test("alias: ls で pageListCmd を返し、パスにも ls が入る", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["page", "ls", "--help"])
    expect(result.pathSegments).toEqual(["cos", "page", "ls"])
    expect(Object.is(result.cmd, pageListCmd)).toBe(true)
  })

  test("未知のサブコマンド: ルートに graceful fallback", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["foobar"])
    expect(result.pathSegments).toEqual(["cos"])
    expect(Object.is(result.cmd, rootCmd)).toBe(true)
  })

  test("グループ直下の未知コマンド: pageCmd に graceful fallback", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["page", "foobar"])
    expect(result.pathSegments).toEqual(["cos", "page"])
    expect(Object.is(result.cmd, pageCmd)).toBe(true)
  })

  test("二重登録された alias (find=search): 入力キーをパスに使う", async () => {
    const result = await resolveCommandPath(rootCmd, "cos", ["find", "--help"])
    expect(result.pathSegments).toEqual(["cos", "find"])
    expect(Object.is(result.cmd, searchCmd)).toBe(true)
  })
})

describe("renderUsageForArgs", () => {
  let originalArgv: string[]

  beforeEach(() => {
    originalArgv = process.argv.slice()
  })

  afterEach(() => {
    process.argv.splice(0, process.argv.length, ...originalArgv)
  })

  test("ルートヘルプ: 'cos' を含み バイナリパスを含まない", async () => {
    const result = await renderUsageForArgs(rootCmd, "cos", ["--help"])
    expect(result).toContain("cos")
    expect(result).not.toContain("/$bunfs/")
  })

  test("グループヘルプ: 'cos page' を含む", async () => {
    const result = await renderUsageForArgs(rootCmd, "cos", ["page", "--help"])
    expect(result).toContain("cos page")
    expect(result).not.toContain("/$bunfs/")
  })

  test("3階層ヘルプ: 'cos page list' を含む", async () => {
    const result = await renderUsageForArgs(rootCmd, "cos", ["page", "list", "--help"])
    expect(result).toContain("cos page list")
    expect(result).not.toContain("/$bunfs/")
  })

  test("フラグ混じり3階層: 'cos page list' を含む", async () => {
    const result = await renderUsageForArgs(rootCmd, "cos", [
      "page",
      "list",
      "--project",
      "foo",
      "--help",
    ])
    expect(result).toContain("cos page list")
    expect(result).not.toContain("/$bunfs/")
  })

  test("alias 経由: 'cos page ls' を含む", async () => {
    const result = await renderUsageForArgs(rootCmd, "cos", ["page", "ls", "--help"])
    expect(result).toContain("cos page ls")
    expect(result).not.toContain("/$bunfs/")
  })

  test("bun SFE バイナリパス偽装: process.argv[1] をバイナリパスにしても露出しない", async () => {
    process.argv[1] = "/$bunfs/root/cos-darwin-arm64"
    const result = await renderUsageForArgs(rootCmd, "cos", ["page", "list", "--help"])
    expect(result).toContain("cos page list")
    expect(result).not.toContain("/$bunfs/")
    expect(result).not.toContain("cos-darwin-arm64")
  })
})
