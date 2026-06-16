/**
 * preview.op.test.ts — `cos page edit preview <title> --op=<op>` のテスト。
 *
 * PR 2 で追加した --op ディスパッチャの振る舞いを検証する。
 * 各 op が対応する buildXxxChanges を呼ぶこと、および
 * バリデーションエラーのケースを確認する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import * as sharedModule from "@/commands/_shared"
import { pageEditPreviewCommand } from "@/commands/page/edit/preview"
import type * as restModule from "@/core/api/rest"
import * as editV2Module from "@/core/edit-v2"

/** テスト用 PAT フォーマット */
const TEST_PAT = `pat_${"a".repeat(64)}`

/** previewEditV2 の成功レスポンスフィクスチャ */
const PREVIEW_RESPONSE = {
  previewId: "プレビューID-xyz",
  expireAt: "2026-06-20T12:00:00.000Z",
  pagePreview: {
    title: "テストページ",
    persistent: true,
    lines: [
      { id: "行001", text: "テストページ" },
      { id: "行002", text: "既存の行" },
    ],
  },
}

/** getPage のレスポンスフィクスチャ (3 行構成) */
const PAGE_RESPONSE = {
  id: "ページID-001",
  title: "テストページ",
  lines: [
    { id: "行001", text: "テストページ", userId: "u1", created: 0, updated: 0 },
    { id: "行002", text: "2行目", userId: "u1", created: 0, updated: 0 },
    { id: "行003", text: "3行目", userId: "u1", created: 0, updated: 0 },
  ],
}

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let stderrMock: ReturnType<typeof spyOn>
let requirePatSpy: ReturnType<typeof spyOn> | undefined
let buildRestClientSpy: ReturnType<typeof spyOn> | undefined

async function runPreview(args: Record<string, unknown>) {
  const defaults = {
    json: false,
    plain: false,
    "results-only": false,
    quiet: false,
    "dry-run": false,
    "strict-notation": false,
    "allow-unsafe-read": false,
    new: false,
  }
  await (
    pageEditPreviewCommand.run as (ctx: {
      args: unknown
      cmd: never
      rawArgs: string[]
    }) => Promise<void>
  )({
    args: { ...defaults, ...args },
    cmd: {} as never,
    rawArgs: [],
  })
}

function setupMocks(previewResult = PREVIEW_RESPONSE, getPageResult = PAGE_RESPONSE) {
  requirePatSpy = spyOn(sharedModule, "requirePat").mockResolvedValue(TEST_PAT)
  const mockClient = {
    previewEditV2: async () => previewResult,
    getPage: async () => getPageResult,
  }
  buildRestClientSpy = spyOn(sharedModule, "buildRestClient").mockResolvedValue(
    mockClient as unknown as restModule.CosenseRestClient,
  )
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  stderrMock = spyOn(process.stderr, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_PERSONAL_ACCESS_TOKEN")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  stderrMock.mockRestore()
  requirePatSpy?.mockRestore()
  buildRestClientSpy?.mockRestore()
  requirePatSpy = undefined
  buildRestClientSpy = undefined
})

describe("pageEditPreviewCommand --op ディスパッチャ", () => {
  describe("--op=append", () => {
    it("buildAppendChanges を呼んで previewId を出力する", async () => {
      setupMocks()
      const appendSpy = spyOn(editV2Module, "buildAppendChanges")

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "append",
          text: "追加する行テキスト",
        })
      } catch {}

      expect(appendSpy).toHaveBeenCalledTimes(1)
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("プレビューID-xyz")
      appendSpy.mockRestore()
    })

    it("--text が未指定の場合は CONTENT_REQUIRED で exit 5", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "append",
          text: undefined,
        })
      } catch {}

      expect(exitMock).toHaveBeenCalledWith(5)
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("CONTENT_REQUIRED")
    })
  })

  describe("--op=prepend", () => {
    it("buildPrependChanges をタイトル直後のアンカーで呼ぶ", async () => {
      setupMocks()
      const prependSpy = spyOn(editV2Module, "buildPrependChanges")

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "prepend",
          text: "先頭に挿入する行",
        })
      } catch {}

      expect(prependSpy).toHaveBeenCalledTimes(1)
      // anchorLineId は PAGE_RESPONSE.lines[1].id = "行002" (タイトル直後)
      expect(prependSpy).toHaveBeenCalledWith("行002", expect.any(Array))
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("プレビューID-xyz")
      prependSpy.mockRestore()
    })

    it("--text が未指定の場合は CONTENT_REQUIRED で exit 5", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "prepend",
          text: undefined,
        })
      } catch {}

      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("--op=insert", () => {
    it("--after <n> で行番号指定したとき buildInsertChanges を呼ぶ", async () => {
      setupMocks()
      const insertSpy = spyOn(editV2Module, "buildInsertChanges")

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "insert",
          text: "挿入する行",
          after: "2", // 2行目の後ろ → anchorLineId は lines[2].id = "行003"
        })
      } catch {}

      expect(insertSpy).toHaveBeenCalledTimes(1)
      // after=2 の場合、次行は lines[2] = "行003"
      expect(insertSpy).toHaveBeenCalledWith("行003", expect.any(Array))
      insertSpy.mockRestore()
    })

    it("--after も --after-id も未指定の場合は VALIDATION_ERROR で exit 5", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "insert",
          text: "挿入する行",
          // after / after-id を指定しない
        })
      } catch {}

      expect(exitMock).toHaveBeenCalledWith(5)
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("VALIDATION_ERROR")
    })

    it("--text が未指定の場合は CONTENT_REQUIRED で exit 5", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "insert",
          text: undefined,
          after: "1",
        })
      } catch {}

      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("--op=line-replace", () => {
    it("buildReplaceChanges を --line-number と --text で呼ぶ", async () => {
      setupMocks()
      const replaceSpy = spyOn(editV2Module, "buildReplaceChanges")

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "line-replace",
          "line-number": "2", // 2行目 → lines[1].id = "行002"
          text: "新しいテキスト",
        })
      } catch {}

      expect(replaceSpy).toHaveBeenCalledTimes(1)
      expect(replaceSpy).toHaveBeenCalledWith("行002", "新しいテキスト")
      replaceSpy.mockRestore()
    })

    it("--line-number が未指定の場合は VALIDATION_ERROR で exit 5", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "line-replace",
          text: "新しいテキスト",
          // line-number を指定しない
        })
      } catch {}

      expect(exitMock).toHaveBeenCalledWith(5)
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("VALIDATION_ERROR")
    })

    it("--text が未指定の場合は CONTENT_REQUIRED で exit 5", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "line-replace",
          "line-number": "2",
          text: undefined,
        })
      } catch {}

      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("--op=line-delete", () => {
    it("buildDeleteChanges を --line-number で呼ぶ", async () => {
      setupMocks()
      const deleteSpy = spyOn(editV2Module, "buildDeleteChanges")

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "line-delete",
          "line-number": "2", // 2行目 → lines[1].id = "行002"
        })
      } catch {}

      expect(deleteSpy).toHaveBeenCalledTimes(1)
      expect(deleteSpy).toHaveBeenCalledWith(["行002"])
      deleteSpy.mockRestore()
    })

    it("buildDeleteChanges を --range で呼ぶ", async () => {
      setupMocks()
      const deleteSpy = spyOn(editV2Module, "buildDeleteChanges")

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "line-delete",
          range: "2:3", // 2〜3行目 → "行002","行003"
        })
      } catch {}

      expect(deleteSpy).toHaveBeenCalledTimes(1)
      expect(deleteSpy).toHaveBeenCalledWith(["行002", "行003"])
      deleteSpy.mockRestore()
    })

    it("--line-number も --range も未指定の場合は VALIDATION_ERROR で exit 5", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "line-delete",
          // line-number も range も未指定
        })
      } catch {}

      expect(exitMock).toHaveBeenCalledWith(5)
    })
  })

  describe("--op=new-page", () => {
    it("buildNewPageChanges をタイトルと --text で呼ぶ", async () => {
      setupMocks()
      const newPageSpy = spyOn(editV2Module, "buildNewPageChanges")

      try {
        await runPreview({
          title: "新しいページ",
          project: "テストプロジェクト",
          op: "new-page",
          text: "1行目の本文\n2行目の本文",
        })
      } catch {}

      expect(newPageSpy).toHaveBeenCalledTimes(1)
      expect(newPageSpy).toHaveBeenCalledWith("新しいページ", ["1行目の本文", "2行目の本文"])
      newPageSpy.mockRestore()
    })

    it("既存の --new --body フラグも new-page と同じ動作をする (後方互換)", async () => {
      setupMocks()
      const newPageSpy = spyOn(editV2Module, "buildNewPageChanges")

      try {
        await runPreview({
          title: "新しいページ",
          project: "テストプロジェクト",
          new: true,
          body: "本文行",
        })
      } catch {}

      expect(newPageSpy).toHaveBeenCalledTimes(1)
      newPageSpy.mockRestore()
    })
  })

  describe("--op=ops", () => {
    it("--ops JSON を使った既存の編集動作と同じ結果になる", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "ops",
          ops: JSON.stringify({ ops: [{ insertBefore: "_end", text: "末尾追加" }] }),
        })
      } catch {}

      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("プレビューID-xyz")
    })

    it("--op 未指定で --ops を使う既存動作も引き続き動作する (後方互換)", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          ops: JSON.stringify({ ops: [{ insertBefore: "_end", text: "末尾追加" }] }),
        })
      } catch {}

      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("プレビューID-xyz")
    })
  })

  describe("--op バリデーション", () => {
    it("未知の --op 値は VALIDATION_ERROR で exit 5", async () => {
      setupMocks()

      try {
        await runPreview({
          title: "テストページ",
          project: "テストプロジェクト",
          op: "unknown-op",
          text: "テキスト",
        })
      } catch {}

      expect(exitMock).toHaveBeenCalledWith(5)
      const output = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(output).toContain("VALIDATION_ERROR")
    })
  })
})
