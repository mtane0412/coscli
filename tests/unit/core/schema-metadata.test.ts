/**
 * schema-metadata.test.ts — コマンドメタデータレジストリのテスト。
 *
 * SCHEMA_COMMAND_METADATA が主要コマンドの requiresAuthKind / permissionKind /
 * deprecated / conditionalArgs を正しく定義しているかを検証する。
 */

import { describe, expect, it } from "bun:test"
import { SCHEMA_COMMAND_METADATA } from "@/core/schema-metadata"

describe("SCHEMA_COMMAND_METADATA", () => {
  describe("page.get — 読み取り統合エントリ", () => {
    it("requiresAuthKind が any", () => {
      expect(SCHEMA_COMMAND_METADATA["page.get"]?.requiresAuthKind).toBe("any")
    })

    it("permissionKind が read", () => {
      expect(SCHEMA_COMMAND_METADATA["page.get"]?.permissionKind).toBe("read")
    })

    it("conditionalArgs に --format=code/table のとき --filename 必須が定義されている", () => {
      const cond = SCHEMA_COMMAND_METADATA["page.get"]?.conditionalArgs
      expect(cond).toBeDefined()
      const filenameCond = cond?.find((c) => c.when.arg === "format")
      expect(filenameCond?.when.equals).toContain("code")
      expect(filenameCond?.when.equals).toContain("table")
      expect(filenameCond?.required).toContain("filename")
    })

    it("examples が定義されている", () => {
      const examples = SCHEMA_COMMAND_METADATA["page.get"]?.examples
      expect(examples?.length).toBeGreaterThan(0)
    })
  })

  describe("page.edit.preview — 書き込み統合エントリ", () => {
    it("requiresAuthKind が pat", () => {
      expect(SCHEMA_COMMAND_METADATA["page.edit.preview"]?.requiresAuthKind).toBe("pat")
    })

    it("permissionKind が write", () => {
      expect(SCHEMA_COMMAND_METADATA["page.edit.preview"]?.permissionKind).toBe("write")
    })

    it("examples が定義されている", () => {
      const examples = SCHEMA_COMMAND_METADATA["page.edit.preview"]?.examples
      expect(examples?.length).toBeGreaterThan(0)
    })
  })

  describe("SID 必須コマンド", () => {
    const sidCommands = [
      "page.delete",
      "page.rename",
      "page.pin",
      "page.unpin",
      "page.update-links",
    ]

    for (const cmd of sidCommands) {
      it(`${cmd} の requiresAuthKind が sid`, () => {
        expect(SCHEMA_COMMAND_METADATA[cmd]?.requiresAuthKind).toBe("sid")
      })
    }

    it("page.delete の permissionKind が destructive", () => {
      expect(SCHEMA_COMMAND_METADATA["page.delete"]?.permissionKind).toBe("destructive")
    })

    it("page.rename の permissionKind が destructive", () => {
      expect(SCHEMA_COMMAND_METADATA["page.rename"]?.permissionKind).toBe("destructive")
    })
  })

  describe("deprecated 読み取り verb", () => {
    const deprecatedReadVerbs = [
      { id: "page.text", replacement: "page get --format=text" },
      { id: "page.url", replacement: "page get --format=url" },
      { id: "page.icon", replacement: "page get --format=icon" },
      { id: "page.context", replacement: "page get --format=context" },
    ]

    for (const { id } of deprecatedReadVerbs) {
      it(`${id} は deprecated で canonicalId が page.get`, () => {
        const meta = SCHEMA_COMMAND_METADATA[id]
        expect(meta?.deprecated).toBeDefined()
        expect(meta?.canonicalId).toBe("page.get")
        const rep: string = meta?.deprecated?.replacement ?? ""
        expect(rep).not.toBe("")
        // replacement が "page get" で始まることを確認
        expect(rep).toContain("page get")
      })
    }
  })

  describe("deprecated 書き込み verb", () => {
    const deprecatedWriteVerbs = [
      "page.append.preview",
      "page.prepend.preview",
      "page.insert.preview",
      "page.new.preview",
      "page.line.replace.preview",
      "page.line.delete.preview",
    ]

    for (const id of deprecatedWriteVerbs) {
      it(`${id} は deprecated で canonicalId が page.edit.preview`, () => {
        const meta = SCHEMA_COMMAND_METADATA[id]
        expect(meta?.deprecated).toBeDefined()
        expect(meta?.canonicalId).toBe("page.edit.preview")
        expect(meta?.requiresAuthKind).toBe("pat")
      })
    }
  })

  describe("認証不要コマンド", () => {
    const noAuthCommands = ["schema", "exit-codes", "notation", "config.get", "config.path"]

    for (const cmd of noAuthCommands) {
      it(`${cmd} の requiresAuthKind が none`, () => {
        expect(SCHEMA_COMMAND_METADATA[cmd]?.requiresAuthKind).toBe("none")
      })
    }
  })
})
