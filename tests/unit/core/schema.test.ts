/**
 * schema.test.ts — citty CommandDef の再帰 JSON 化ロジックのテスト。
 *
 * 小さなダミー CommandDef を入力として buildSchema / findCommandByPath の
 * 出力構造・alias グルーピング・Resolvable 解決を検証する。
 */

import { describe, expect, it } from "bun:test"
import { buildSchema, findCommandByPath } from "@/core/schema"
import type { CommandDef } from "citty"

/** テスト用のリーフコマンド定義（list / ls で同一参照） */
const listCommand: CommandDef = {
  meta: { name: "list", description: "一覧を取得する" },
  args: {
    project: { type: "string", description: "プロジェクト名", alias: "p", required: false },
    json: { type: "boolean", description: "JSON 出力", alias: ["J"], default: false },
    limit: { type: "string", description: "取得件数" },
  },
}

/** テスト用のグループコマンド定義 */
const pageGroup: CommandDef = {
  meta: { name: "page", description: "ページ操作" },
  args: {},
  subCommands: {
    list: listCommand,
    ls: listCommand, // 同一参照 → aliases にまとめる
    new: {
      meta: { name: "new", description: "ページを作成する" },
      args: {
        title: { type: "positional", description: "ページタイトル" },
      },
    },
  },
}

/** ルートコマンド定義 */
const rootCommand: CommandDef = {
  meta: { name: "cos", description: "テスト用ルートコマンド" },
  args: {
    color: { type: "string", description: "カラー設定", default: "auto" },
  },
  subCommands: {
    page: pageGroup,
  },
}

describe("buildSchema", () => {
  it("ルートの name と description を返す", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    expect(schema.name).toBe("cos")
    expect(schema.description).toBe("テスト用ルートコマンド")
  })

  it("ルートの aliases は空配列", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    expect(schema.aliases).toEqual([])
  })

  it("ルートの args を返す", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    const colorArg = schema.args.find((a) => a.name === "color")
    expect(colorArg).toBeDefined()
    expect(colorArg?.type).toBe("string")
    expect(colorArg?.default).toBe("auto")
    expect(colorArg?.alias).toEqual([])
  })

  it("サブコマンドを含む", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    const pageCmd = schema.subCommands.find((c) => c.name === "page")
    expect(pageCmd).toBeDefined()
  })

  it("同一参照の list と ls が canonical=list + aliases=[ls] にまとまる", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    const pageCmd = schema.subCommands.find((c) => c.name === "page")
    const listCmd = pageCmd?.subCommands.find((c) => c.name === "list")
    expect(listCmd).toBeDefined()
    expect(listCmd?.aliases).toContain("ls")
    // ls という name のコマンドは存在しない（canonical に統合済み）
    const lsCmd = pageCmd?.subCommands.find((c) => c.name === "ls")
    expect(lsCmd).toBeUndefined()
  })

  it("alias が string の場合に string[] に正規化される", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    const pageCmd = schema.subCommands.find((c) => c.name === "page")
    const listCmd = pageCmd?.subCommands.find((c) => c.name === "list")
    const projectArg = listCmd?.args.find((a) => a.name === "project")
    // alias: "p" → ["p"] に正規化
    expect(projectArg?.alias).toEqual(["p"])
  })

  it("alias が string[] の場合にそのまま保持される", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    const pageCmd = schema.subCommands.find((c) => c.name === "page")
    const listCmd = pageCmd?.subCommands.find((c) => c.name === "list")
    const jsonArg = listCmd?.args.find((a) => a.name === "json")
    expect(jsonArg?.alias).toEqual(["J"])
  })

  it("alias 未定義の場合は空配列になる", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    const pageCmd = schema.subCommands.find((c) => c.name === "page")
    const listCmd = pageCmd?.subCommands.find((c) => c.name === "list")
    const limitArg = listCmd?.args.find((a) => a.name === "limit")
    expect(limitArg?.alias).toEqual([])
  })

  it("positional 型の args を正しく含む", async () => {
    const schema = await buildSchema(rootCommand, "cos")
    const pageCmd = schema.subCommands.find((c) => c.name === "page")
    const newCmd = pageCmd?.subCommands.find((c) => c.name === "new")
    const titleArg = newCmd?.args.find((a) => a.name === "title")
    expect(titleArg?.type).toBe("positional")
    expect(titleArg?.alias).toEqual([])
  })

  it("Resolvable<T> が関数の場合でも解決される", async () => {
    const lazyCommand: CommandDef = {
      meta: () => ({ name: "lazy", description: "遅延解決テスト" }),
      args: () => ({
        flag: { type: "boolean" },
      }),
    }
    const schema = await buildSchema(lazyCommand, "lazy")
    expect(schema.name).toBe("lazy")
    expect(schema.args.find((a) => a.name === "flag")).toBeDefined()
  })

  it("Resolvable<T> が async 関数の場合でも解決される", async () => {
    const asyncCommand: CommandDef = {
      meta: async () => ({ name: "async-cmd", description: "非同期解決テスト" }),
      args: async () => ({
        value: { type: "string", description: "値" },
      }),
    }
    const schema = await buildSchema(asyncCommand, "async-cmd")
    expect(schema.name).toBe("async-cmd")
    expect(schema.args.find((a) => a.name === "value")).toBeDefined()
  })
})

describe("findCommandByPath", () => {
  it("空パスはルートを返す", async () => {
    const result = await findCommandByPath(rootCommand, "cos", [])
    expect(result).not.toBeNull()
    expect(result?.name).toBe("cos")
  })

  it("['page'] で page グループを返す", async () => {
    const result = await findCommandByPath(rootCommand, "cos", ["page"])
    expect(result).not.toBeNull()
    expect(result?.name).toBe("page")
  })

  it("['page', 'list'] で list コマンドを返す", async () => {
    const result = await findCommandByPath(rootCommand, "cos", ["page", "list"])
    expect(result).not.toBeNull()
    expect(result?.name).toBe("list")
  })

  it("alias パス ['page', 'ls'] でも list コマンドを返す", async () => {
    const result = await findCommandByPath(rootCommand, "cos", ["page", "ls"])
    expect(result).not.toBeNull()
    expect(result?.name).toBe("list")
  })

  it("未知のコマンドパスは null を返す", async () => {
    const result = await findCommandByPath(rootCommand, "cos", ["page", "unknown"])
    expect(result).toBeNull()
  })

  it("存在しないグループは null を返す", async () => {
    const result = await findCommandByPath(rootCommand, "cos", ["project"])
    expect(result).toBeNull()
  })
})
