/**
 * page/edit.test.ts — `cos page edit <title>` コマンドのテスト。
 *
 * バリデーション (--input-format の無効値、空コンテンツ) と
 * Cosense 記法 lint 統合 (warnings / --strict-notation) および
 * 楽観ロック (CommitConflictError → exit 6 / --force / --expect-commit) を検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pageEditCommand } from "@/commands/page/edit"
import { CommitConflictError } from "@/core/errors"
import * as pages from "@/core/pages"

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let editPageSpy: ReturnType<typeof spyOn> | undefined

async function runEdit(args: Record<string, unknown>) {
  await (
    pageEditCommand.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>
  )({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  // requireSid のキーチェーン呼び出しをスキップするためダミー SID を設定する
  process.env["COS_SID"] = "dummy-session-id-for-test"
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  editPageSpy?.mockRestore()
  editPageSpy = undefined
  Reflect.deleteProperty(process.env, "COS_SID")
})

describe("pageEditCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    // 一時ファイルを作成
    const tmpFile = join(tmpdir(), `cos-test-edit-${Date.now()}.txt`)
    writeFileSync(tmpFile, "テスト本文\n")
    try {
      await runEdit({
        title: "テストページ",
        "from-file": tmpFile,
        "input-format": "txt",
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        "strict-notation": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("--input-format に未知の値を指定した場合は VALIDATION_ERROR で exit 5", async () => {
    const tmpFile = join(tmpdir(), `cos-test-edit-${Date.now()}.xml`)
    writeFileSync(tmpFile, "<doc>テスト</doc>\n")
    try {
      await runEdit({
        title: "テストページ",
        "from-file": tmpFile,
        "input-format": "xml",
        project: "テストプロジェクト",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        "strict-notation": false,
        quiet: false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
    expect(stdoutMock).toHaveBeenCalledWith(expect.stringContaining("VALIDATION_ERROR"))
  })

  it("--input-format=md の場合、MD ファイルを読み込んでバリデーションを通過し先へ進む", async () => {
    // MD ファイルを作成
    const tmpFile = join(tmpdir(), `cos-test-edit-${Date.now()}.md`)
    writeFileSync(tmpFile, "## テスト見出し\n本文テキスト\n")
    // COS_SID は beforeEach でダミー値が設定済み。
    // --dry-run=true によって DryRunWriter が使われ WS 接続なしで最後まで完走する
    await runEdit({
      title: "テストページ",
      "from-file": tmpFile,
      "input-format": "md",
      project: "テストプロジェクト",
      json: false,
      plain: false,
      "results-only": false,
      "dry-run": true,
      "strict-notation": false,
      quiet: false,
    })
    // VALIDATION_ERROR が出ていないこと (MD フォーマットは有効)
    const calls = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(calls).not.toContain("VALIDATION_ERROR")
    // exit 5 が呼ばれていないこと (MD フォーマットはバリデーションを通過する)
    expect(exitMock).not.toHaveBeenCalledWith(5)
  })

  describe("Cosense 記法 lint 統合", () => {
    it("誤用記法があると --json 出力の meta.warnings に含まれる", async () => {
      // [*テスト] はスペースなし → no-space-in-emphasis が検出される
      const tmpFile = join(tmpdir(), `cos-test-edit-lint-${Date.now()}.txt`)
      writeFileSync(tmpFile, "[*テスト]\n正常な行\n")
      await runEdit({
        title: "記法テストページ",
        "from-file": tmpFile,
        "input-format": "txt",
        project: "テストプロジェクト",
        json: true,
        plain: false,
        "results-only": false,
        "dry-run": true,
        "strict-notation": false,
        quiet: false,
      })
      const out = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      const parsed = JSON.parse(out)
      // meta.warnings に lint 結果が含まれること
      expect(Array.isArray(parsed.meta?.warnings)).toBe(true)
      expect(parsed.meta.warnings.length).toBeGreaterThan(0)
      expect(parsed.meta.warnings[0]).toContain("no-space-in-emphasis")
    })

    it("正常な記法のファイルは meta.warnings が空配列", async () => {
      // 正しいCosense記法: 大きいサイズが先に来る (*** → ** の順)
      const tmpFile = join(tmpdir(), `cos-test-edit-lint-ok-${Date.now()}.txt`)
      writeFileSync(tmpFile, "[*** 大見出し]\n[** 中見出し]\n通常テキスト\n")
      await runEdit({
        title: "記法正常テストページ",
        "from-file": tmpFile,
        "input-format": "txt",
        project: "テストプロジェクト",
        json: true,
        plain: false,
        "results-only": false,
        "dry-run": true,
        "strict-notation": false,
        quiet: false,
      })
      const out = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      const parsed = JSON.parse(out)
      expect(parsed.meta?.warnings).toEqual([])
    })

    it("--strict-notation が有効なら lint 警告があると exit 5 で中止する", async () => {
      const tmpFile = join(tmpdir(), `cos-test-edit-strict-${Date.now()}.txt`)
      writeFileSync(tmpFile, "[*NG記法]\n")
      try {
        await runEdit({
          title: "厳格テストページ",
          "from-file": tmpFile,
          "input-format": "txt",
          project: "テストプロジェクト",
          json: true,
          plain: false,
          "results-only": false,
          "dry-run": true,
          "strict-notation": true,
          quiet: false,
        })
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(5)
      const out = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(out).toContain("NOTATION_LINT")
    })
  })

  describe("楽観ロック", () => {
    /** 楽観ロックテスト用の共通 args (--dry-run は使わず editPage をモックする) */
    function makeConflictArgs(extra: Record<string, unknown> = {}) {
      const tmpFile = join(tmpdir(), `cos-test-edit-conflict-${Date.now()}.txt`)
      writeFileSync(tmpFile, "テスト本文\n")
      return {
        title: "テストページ",
        "from-file": tmpFile,
        "input-format": "txt",
        project: "テストプロジェクト",
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        "strict-notation": false,
        quiet: false,
        ...extra,
      }
    }

    it("editPage が CommitConflictError をスローした場合は exit 6 で終了する", async () => {
      // editPage をモックして CommitConflictError を投げさせる
      editPageSpy = spyOn(pages, "editPage").mockImplementation(async () => {
        throw new CommitConflictError("編集中に他者がページを更新しました (attempts=1)")
      })
      try {
        await runEdit(makeConflictArgs())
      } catch {
        // process.exit モック後の継続による throw は想定内
      }
      expect(exitMock).toHaveBeenCalledWith(6)
      const out = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
      expect(out).toContain("CONFLICT")
    })

    it("--force を指定した場合は editPage が force: true で呼ばれる", async () => {
      // --force 時は楽観ロックを無効化して呼び出すこと
      const capturedForce: (boolean | undefined)[] = []
      editPageSpy = spyOn(pages, "editPage").mockImplementation(async (_writer, opts) => {
        capturedForce.push(opts.force)
        return { commitId: "コミット", pageId: "ページ" }
      })
      await runEdit(makeConflictArgs({ force: true }))
      expect(capturedForce[0]).toBe(true)
    })

    it("--expect-commit を指定した場合は editPage が expectCommitId 付きで呼ばれる", async () => {
      // --expect-commit で指定した commitId が editPage に伝播すること
      const capturedExpectCommitId: (string | undefined)[] = []
      editPageSpy = spyOn(pages, "editPage").mockImplementation(async (_writer, opts) => {
        capturedExpectCommitId.push(opts.expectCommitId)
        return { commitId: "コミット", pageId: "ページ" }
      })
      await runEdit(makeConflictArgs({ "expect-commit": "abc123" }))
      expect(capturedExpectCommitId[0]).toBe("abc123")
    })
  })
})
