/**
 * cli-error-handler.test.ts — エラー種別と終了コードのマッピングテスト。
 *
 * resolveExitCode / resolveErrorCode が各エラー種別を正しい値に変換するか検証する。
 */

import { describe, expect, it } from "bun:test"
import { CommitConflictError } from "@/core/errors"
import { resolveErrorCode, resolveExitCode } from "@/infra/cli-error-handler"

describe("resolveExitCode", () => {
  it("CommitConflictError は EXIT_CONFLICT (6) を返す", () => {
    const err = new CommitConflictError("楽観ロック競合が発生しました")
    expect(resolveExitCode(err)).toBe(6)
  })

  it("CommitConflictError は expectedCommitId と actualCommitId を保持する", () => {
    const err = new CommitConflictError("競合", "期待ID", "実際ID")
    expect(err.expectedCommitId).toBe("期待ID")
    expect(err.actualCommitId).toBe("実際ID")
  })

  it("未知のエラーは EXIT_ERROR (1) を返す", () => {
    const err = new Error("一般エラー")
    expect(resolveExitCode(err)).toBe(1)
  })
})

describe("resolveErrorCode", () => {
  it("CommitConflictError は CONFLICT を返す", () => {
    const err = new CommitConflictError("競合発生")
    expect(resolveErrorCode(err)).toBe("CONFLICT")
  })

  it("未知のエラーは ERROR を返す", () => {
    const err = new Error("一般エラー")
    expect(resolveErrorCode(err)).toBe("ERROR")
  })
})
