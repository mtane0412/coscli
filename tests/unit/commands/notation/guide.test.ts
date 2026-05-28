/**
 * notation/guide.test.ts — `cos notation` コマンドのテスト。
 *
 * トピック一覧表示 / 個別トピック取得 / 未知トピックエラー /
 * JSON・plain・テーブル形式の出力と正常終了を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { notationGuideCommand } from "@/commands/notation/guide"
import { NOTATION_GUIDE } from "@/core/notation/guide"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>

function makeArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    json: false,
    plain: false,
    "results-only": false,
    select: undefined,
    "enable-commands": undefined,
    "disable-commands": undefined,
    verbose: undefined,
    quiet: false,
    profile: undefined,
    project: undefined,
    topic: undefined,
    ...overrides,
  }
}

async function runNotation(args: Record<string, unknown>): Promise<void> {
  await (
    notationGuideCommand.run as (ctx: {
      args: unknown
      cmd: never
      rawArgs: string[]
    }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

function captureStdout(): string {
  return (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
}

function captureStderr(): string {
  return (stderrMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
})

describe("notationGuideCommand", () => {
  // =====================================================================
  // トピック一覧 (引数なし)
  // =====================================================================
  describe("引数なし — トピック一覧", () => {
    it("テーブル形式でトピック ID 一覧を出力する", async () => {
      await runNotation(makeArgs())
      const out = captureStdout()
      // id 列とtitle 列がある
      expect(out).toContain("id")
      expect(out).toContain("basics")
      expect(out).toContain("decoration")
      expect(out).toContain("mermaid")
    })

    it("全 17 トピック ID が一覧に含まれる", async () => {
      await runNotation(makeArgs())
      const out = captureStdout()
      const expectedIds = [
        "basics",
        "list",
        "link",
        "hashtag",
        "image",
        "icon",
        "decoration",
        "inline-code",
        "code-block",
        "mermaid",
        "table",
        "quote",
        "math",
        "cli",
        "helpfeel",
        "location",
        "tips",
      ]
      for (const id of expectedIds) {
        expect(out).toContain(id)
      }
    })

    it("--json 時は { topics: [...] } 形式の envelope を返す", async () => {
      await runNotation(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.meta?.command).toBe("notation")
      expect(parsed.data).toHaveProperty("topics")
      expect(Array.isArray(parsed.data.topics)).toBe(true)
    })

    it("topics に id と title が含まれる", async () => {
      await runNotation(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      const first = parsed.data.topics[0]
      expect(first).toHaveProperty("id")
      expect(first).toHaveProperty("title")
    })

    it("全 17 トピック ID が topics 配列に含まれる", async () => {
      await runNotation(makeArgs({ json: true }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      const ids: string[] = parsed.data.topics.map((t: { id: string }) => t.id)
      const expectedIds = [
        "basics",
        "list",
        "link",
        "hashtag",
        "image",
        "icon",
        "decoration",
        "inline-code",
        "code-block",
        "mermaid",
        "table",
        "quote",
        "math",
        "cli",
        "helpfeel",
        "location",
        "tips",
      ]
      for (const id of expectedIds) {
        expect(ids).toContain(id)
      }
    })

    it("--plain 時は TSV 形式で出力する", async () => {
      await runNotation(makeArgs({ plain: true }))
      const out = captureStdout()
      expect(out).toContain("\t")
    })

    it("process.exit を呼ばず正常終了する", async () => {
      await runNotation(makeArgs({ json: true }))
      expect(exitMock).not.toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 個別トピック取得 (topic 指定)
  // =====================================================================
  describe("decoration トピック", () => {
    it("--json で { section: { id: 'decoration', ... } } を返す", async () => {
      await runNotation(makeArgs({ json: true, topic: "decoration" }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.data).toHaveProperty("section")
      expect(parsed.data.section.id).toBe("decoration")
    })

    it("ミックス記法 [-/*** ...] が含まれる", async () => {
      await runNotation(makeArgs({ topic: "decoration" }))
      const out = captureStdout()
      // 公式 help-jp の「[-/*** 打ち消し斜体大きな文字]」に対応するミックス記法記述
      expect(out).toContain("[-/")
    })

    it("--plain でテーブルセクションのみ TSV 出力する", async () => {
      await runNotation(makeArgs({ plain: true, topic: "decoration" }))
      const out = captureStdout()
      expect(out).toContain("\t")
      // decoration のみで table トピックの内容は含まれない
      expect(out).not.toContain("table:")
    })

    it("--plain 出力にセクション見出し行が含まれない", async () => {
      // TSV モードでは === Decoration 記法 === のような見出し行を出力しないこと
      await runNotation(makeArgs({ plain: true, topic: "decoration" }))
      const out = captureStdout()
      expect(out).not.toContain("===")
    })

    it("デフォルト出力にもセクション見出し行が含まれない", async () => {
      // テーブルモードでも === Decoration 記法 === のような見出し行を出力しないこと
      await runNotation(makeArgs({ topic: "decoration" }))
      const out = captureStdout()
      expect(out).not.toContain("===")
    })
  })

  describe("table トピック", () => {
    it("テーブル記法セクションのみ取得する", async () => {
      await runNotation(makeArgs({ topic: "table" }))
      const out = captureStdout()
      expect(out).toContain("table:")
    })

    it("--json で section.id が 'table' になる", async () => {
      await runNotation(makeArgs({ json: true, topic: "table" }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.data.section.id).toBe("table")
    })
  })

  describe("mermaid トピック", () => {
    it("code:mermaid または code:mmd の記述が含まれる", async () => {
      await runNotation(makeArgs({ topic: "mermaid" }))
      const out = captureStdout()
      expect(out).toContain("mermaid")
    })
  })

  describe("helpfeel トピック", () => {
    it("行頭 ? 記法の記述が含まれる", async () => {
      await runNotation(makeArgs({ topic: "helpfeel" }))
      const out = captureStdout()
      expect(out).toContain("?")
    })
  })

  describe("location トピック", () => {
    it("N緯度,E経度 形式の記述が含まれる", async () => {
      await runNotation(makeArgs({ topic: "location" }))
      const out = captureStdout()
      expect(out).toContain("N")
      expect(out).toContain("E")
    })
  })

  describe("tips トピック", () => {
    it("エージェント向け注意事項が含まれる", async () => {
      await runNotation(makeArgs({ topic: "tips" }))
      const out = captureStdout()
      // tips セクションには注意事項が1件以上含まれる
      expect(out.length).toBeGreaterThan(0)
    })

    it("--json で section.id が 'tips' になる", async () => {
      await runNotation(makeArgs({ json: true, topic: "tips" }))
      const out = captureStdout()
      const parsed = JSON.parse(out)
      expect(parsed.data.section.id).toBe("tips")
    })
  })

  // =====================================================================
  // 未知トピックのエラー
  // =====================================================================
  describe("未知トピックのエラー処理", () => {
    it("exit コード 5 で終了する", async () => {
      try {
        await runNotation(makeArgs({ topic: "存在しないトピック" }))
      } catch {
        // exitWithError が throw するため想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("stderr に 'unknown topic' メッセージを出力する", async () => {
      try {
        await runNotation(makeArgs({ topic: "存在しないトピック" }))
      } catch {
        // exitWithError が throw するため想定内
      }
      const err = captureStderr()
      expect(err).toContain("unknown topic")
      expect(err).toContain("存在しないトピック")
    })

    it("stderr に利用可能なトピック ID 一覧が含まれる", async () => {
      try {
        await runNotation(makeArgs({ topic: "存在しないトピック" }))
      } catch {
        // exitWithError が throw するため想定内
      }
      const err = captureStderr()
      expect(err).toContain("basics")
    })
  })

  // =====================================================================
  // NOTATION_GUIDE との整合性
  // =====================================================================
  describe("NOTATION_GUIDE との整合性", () => {
    it("全 sections が id プロパティを持つ", () => {
      for (const section of NOTATION_GUIDE.sections) {
        expect(section).toHaveProperty("id")
        expect(typeof section.id).toBe("string")
        expect(section.id.length).toBeGreaterThan(0)
      }
    })

    it("sections の id に重複がない", () => {
      const ids = NOTATION_GUIDE.sections.map((s) => s.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    })

    it("tips を含む全 17 セクションが存在する", () => {
      expect(NOTATION_GUIDE.sections).toHaveLength(17)
    })
  })
})
