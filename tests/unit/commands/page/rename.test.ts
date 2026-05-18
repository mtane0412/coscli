/**
 * page/rename.test.ts — `cos page rename <title> <new-title>` コマンドのテスト。
 *
 * 重複チェックおよびリネーム元 persistent チェックのロジックを検証する。
 * issue #57: persistent:false のスタブページを重複と誤判定しないよう修正。
 * issue #112: リネーム元が persistent:false/404 の場合に NOT_FOUND (exit 4) で終了する。
 *
 * - REST getPage は msw でモックする。
 * - WebSocket 書き込み (renamePage) は spyOn でモックして WS 接続を回避する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { pageRenameCommand } from "@/commands/page/rename"
import * as pages from "@/core/pages"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

const BASE_URL = "https://scrapbox.io"
const TEST_PROJECT = "テストプロジェクト"

// ---------------------------------------------------------------------------
// msw サーバー設定
// ---------------------------------------------------------------------------

/**
 * 基本モックハンドラ。
 * getPage の挙動はテストごとに server.use() でオーバーライドする。
 */
const server = setupServer(
  // 認証確認用
  http.get(`${BASE_URL}/api/users/me`, () => {
    return HttpResponse.json({ id: "テストユーザーID", name: "テストユーザー" })
  }),
)

beforeAll(() => server.listen())
afterAll(() => server.close())

// ---------------------------------------------------------------------------
// テスト前後処理
// ---------------------------------------------------------------------------

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
let renamePageSpy: ReturnType<typeof spyOn>

/** コマンド run ヘルパー */
async function runRename(args: Record<string, unknown>) {
  await (
    pageRenameCommand.run as (ctx: {
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

beforeEach(() => {
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation(() => true)
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  process.env["COS_SID"] = "s%3Atest-session-id"
  // renamePage をモックして WebSocket 接続を回避する
  renamePageSpy = spyOn(pages, "renamePage").mockImplementation(async () => ({
    commitId: "ダミーコミットID",
    pageId: "ダミーページID",
  }))
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
  renamePageSpy.mockRestore()
  server.resetHandlers()
  Reflect.deleteProperty(process.env, "COS_SID")
})

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe("pageRenameCommand", () => {
  it("プロジェクト未指定の場合は exit 5 で終了する", async () => {
    try {
      await runRename({
        title: "旧タイトル",
        "new-title": "新タイトル",
        project: undefined,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }
    expect(exitMock).toHaveBeenCalledWith(5)
  })

  it("新タイトルが persistent:false のスタブページを返す場合、重複なしとして rename が継続する (issue #57)", async () => {
    // 前提: Cosense REST API は存在しないページに対して persistent:false のスタブとして 200 を返す。
    // 期待: persistent:false はスタブであるため DUPLICATE_TITLE エラーにならず、rename が継続する。
    // 検証: exit 5 が呼ばれないことと、DUPLICATE_TITLE が出力されないことを確認する。
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
        const project = decodeURIComponent(params["project"] as string)
        const title = decodeURIComponent(params["title"] as string)
        if (project === TEST_PROJECT && title === "既存ページ") {
          // リネーム元は実体のある persistent:true のページ
          return HttpResponse.json({
            id: "source-page-id",
            title: "既存ページ",
            persistent: true,
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: "既存ページ",
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        if (project === TEST_PROJECT && title === "存在しない新タイトル") {
          // persistent:false のスタブページを返す (200 だが実体なし)
          return HttpResponse.json({
            id: "stub-page-id",
            title: "存在しない新タイトル",
            persistent: false,
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: "存在しない新タイトル",
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        return HttpResponse.json({ message: "Not found" }, { status: 404 })
      }),
    )

    try {
      await runRename({
        title: "既存ページ",
        "new-title": "存在しない新タイトル",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }

    // DUPLICATE_TITLE エラー (exit 5) が発生していないことを確認する
    const stdoutOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stdoutOutput).not.toContain("DUPLICATE_TITLE")
    expect(exitMock).not.toHaveBeenCalledWith(5)
    // persistent:false はスタブなので rename が実際に呼ばれることを確認する
    expect(renamePageSpy).toHaveBeenCalledTimes(1)
  })

  it("新タイトルが persistent:true のページを返す場合、DUPLICATE_TITLE エラー (exit 5) になる", async () => {
    // 前提: Cosense REST API が既存の実体ページ (persistent:true) を返す。
    // 期待: 本当の重複なので DUPLICATE_TITLE エラー (exit 5) で終了する。
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
        const project = decodeURIComponent(params["project"] as string)
        const title = decodeURIComponent(params["title"] as string)
        if (
          project === TEST_PROJECT &&
          (title === "変更元ページ" || title === "既存ページタイトル")
        ) {
          // リネーム元・リネーム先ともに実体のある persistent:true のページ
          return HttpResponse.json({
            id: `${title}-id`,
            title,
            persistent: true,
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: title,
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        return HttpResponse.json({ message: "Not found" }, { status: 404 })
      }),
    )

    try {
      await runRename({
        title: "変更元ページ",
        "new-title": "既存ページタイトル",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }

    // DUPLICATE_TITLE エラー (exit 5) が発生することを確認する
    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stdoutOutput).toContain("DUPLICATE_TITLE")
    // persistent:true は実体ページなので rename が呼ばれないことを確認する
    expect(renamePageSpy).not.toHaveBeenCalled()
  })

  it("新タイトルが 404 NotFoundError を返す場合、重複なしとして rename が継続する", async () => {
    // 前提: Cosense REST API がリネーム先に対して 404 を返す (真のページなし)。
    // 期待: NotFoundError は重複なしを意味するため、rename が継続する。
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
        const title = decodeURIComponent(params["title"] as string)
        if (title === "既存ページ") {
          // リネーム元は実体のある persistent:true のページ
          return HttpResponse.json({
            id: "source-page-id",
            title: "既存ページ",
            persistent: true,
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: "既存ページ",
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        // リネーム先 "存在しないタイトル" は 404 → 重複なし
        return HttpResponse.json({ message: "Not found" }, { status: 404 })
      }),
    )

    try {
      await runRename({
        title: "既存ページ",
        "new-title": "存在しないタイトル",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }

    // DUPLICATE_TITLE エラー (exit 5) が発生していないことを確認する
    const stdoutOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stdoutOutput).not.toContain("DUPLICATE_TITLE")
    expect(exitMock).not.toHaveBeenCalledWith(5)
    // 404 は重複なしなので rename が実際に呼ばれることを確認する
    expect(renamePageSpy).toHaveBeenCalledTimes(1)
  })

  it("新タイトルが persistent フィールド欠落のページを返す場合、安全側に倒して DUPLICATE_TITLE エラー (exit 5) になる", async () => {
    // 前提: persistent フィールドが欠落 (undefined) のレスポンスを返す。
    // 期待: undefined は安全側 (実体ページ) として扱い DUPLICATE_TITLE エラーになる。
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
        const project = decodeURIComponent(params["project"] as string)
        const title = decodeURIComponent(params["title"] as string)
        if (project === TEST_PROJECT && title === "変更元ページ") {
          // リネーム元は実体のある persistent:true のページ
          return HttpResponse.json({
            id: "source-page-id",
            title: "変更元ページ",
            persistent: true,
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: "変更元ページ",
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        if (project === TEST_PROJECT && title === "persistentなしページ") {
          // persistent フィールドを含まないレスポンス
          return HttpResponse.json({
            id: "ambiguous-page-id",
            title: "persistentなしページ",
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: "persistentなしページ",
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        return HttpResponse.json({ message: "Not found" }, { status: 404 })
      }),
    )

    try {
      await runRename({
        title: "変更元ページ",
        "new-title": "persistentなしページ",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }

    // persistent が undefined でも安全側に倒して DUPLICATE_TITLE になることを確認する
    expect(exitMock).toHaveBeenCalledWith(5)
    const stdoutOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stdoutOutput).toContain("DUPLICATE_TITLE")
    // 重複扱いなので rename は呼ばれない
    expect(renamePageSpy).not.toHaveBeenCalled()
  })

  it("リネーム元が persistent:false のプレースホルダーの場合、exit 4 NOT_FOUND で終了し renamePage は呼ばれない (issue #112)", async () => {
    // 前提: リネーム元タイトルが persistent:false のプレースホルダーページを返す。
    // 期待: 実体のないページはリネーム不可として NOT_FOUND エラー (exit 4) で終了し、
    //       WebSocket commit (renamePage) は呼ばれない。
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
        const project = decodeURIComponent(params["project"] as string)
        const title = decodeURIComponent(params["title"] as string)
        if (project === TEST_PROJECT && title === "プレースホルダーページ") {
          // persistent:false のプレースホルダーページ (本文なし)
          return HttpResponse.json({
            id: "placeholder-page-id",
            title: "プレースホルダーページ",
            persistent: false,
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: "プレースホルダーページ",
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        return HttpResponse.json({ message: "Not found" }, { status: 404 })
      }),
    )

    try {
      await runRename({
        title: "プレースホルダーページ",
        "new-title": "新しいタイトル",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }

    // NOT_FOUND エラー (exit 4) で終了することを確認する
    expect(exitMock).toHaveBeenCalledWith(4)
    const stdoutOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stdoutOutput).toContain("NOT_FOUND")
    // プレースホルダーへの rename は実行されない
    expect(renamePageSpy).not.toHaveBeenCalled()
  })

  it("リネーム元が 404 (NotFoundError) を返す場合、exit 4 NOT_FOUND で終了し renamePage は呼ばれない (issue #112)", async () => {
    // 前提: リネーム元タイトルが 404 を返す (ページが存在しない)。
    // 期待: 存在しないページはリネーム不可として NOT_FOUND エラー (exit 4) で終了し、
    //       WebSocket commit (renamePage) は呼ばれない。
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/:title`, () => {
        return HttpResponse.json({ message: "Not found" }, { status: 404 })
      }),
    )

    try {
      await runRename({
        title: "存在しないソースページ",
        "new-title": "新しいタイトル",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }

    // NOT_FOUND エラー (exit 4) で終了することを確認する
    expect(exitMock).toHaveBeenCalledWith(4)
    const stdoutOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stdoutOutput).toContain("NOT_FOUND")
    // 存在しないページへの rename は実行されない
    expect(renamePageSpy).not.toHaveBeenCalled()
  })

  it("--dry-run 時はリネーム元 persistent チェックをスキップし renamePage が呼ばれる", async () => {
    // 前提: --dry-run フラグが指定されており、リネーム元は persistent:false のプレースホルダー。
    // 期待: dry-run は副作用なしのプレビューのため REST チェックをスキップし、
    //       renamePage が呼ばれる (dry-run なので実際の変更はない)。
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
        const title = decodeURIComponent(params["title"] as string)
        if (title === "プレースホルダーページ") {
          // dry-run 時はこのハンドラが呼ばれないことを期待するが、
          // 万一呼ばれた場合に備えて persistent:false を返す
          return HttpResponse.json({
            id: "placeholder-page-id",
            title: "プレースホルダーページ",
            persistent: false,
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: "プレースホルダーページ",
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        return HttpResponse.json({ message: "Not found" }, { status: 404 })
      }),
    )

    try {
      await runRename({
        title: "プレースホルダーページ",
        "new-title": "新しいタイトル",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": true,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }

    // dry-run なので NOT_FOUND エラーにならない
    expect(exitMock).not.toHaveBeenCalledWith(4)
    // renamePage が呼ばれる (dry-run はスキップではなくプレビュー実行)
    expect(renamePageSpy).toHaveBeenCalledTimes(1)
  })

  it("リネーム元が persistent フィールド欠落のページを返す場合、安全側に倒して exit 4 NOT_FOUND で終了し renamePage は呼ばれない (issue #112)", async () => {
    // 前提: リネーム元タイトルが persistent フィールドを持たない (undefined) レスポンスを返す。
    // 期待: persistent:true 以外は実体不明として NOT_FOUND エラー (exit 4) で終了し、
    //       WebSocket commit (renamePage) は呼ばれない。
    // 注記: persistent === undefined のケースは safe-side に倒して rename を禁止する。
    server.use(
      http.get(`${BASE_URL}/api/pages/:project/:title`, ({ params }) => {
        const project = decodeURIComponent(params["project"] as string)
        const title = decodeURIComponent(params["title"] as string)
        if (project === TEST_PROJECT && title === "persistentなしソースページ") {
          // persistent フィールドを含まないレスポンス (undefined 扱い)
          return HttpResponse.json({
            id: "ambiguous-source-page-id",
            title: "persistentなしソースページ",
            created: 1700000000,
            updated: 1700000000,
            lines: [
              {
                id: "line-1",
                text: "persistentなしソースページ",
                userId: "user-1",
                created: 1700000000,
                updated: 1700000000,
              },
            ],
          })
        }
        return HttpResponse.json({ message: "Not found" }, { status: 404 })
      }),
    )

    try {
      await runRename({
        title: "persistentなしソースページ",
        "new-title": "新しいタイトル",
        project: TEST_PROJECT,
        json: false,
        plain: false,
        "results-only": false,
        "dry-run": false,
        quiet: false,
        "force-fallback": false,
      })
    } catch {
      // process.exit モック後の継続による throw は想定内
    }

    // persistent が undefined でも安全側に倒して NOT_FOUND エラー (exit 4) で終了することを確認する
    expect(exitMock).toHaveBeenCalledWith(4)
    const stdoutOutput = (stdoutMock.mock.calls as unknown[][]).map((c) => String(c[0])).join("")
    expect(stdoutOutput).toContain("NOT_FOUND")
    // persistent が不明なページへの rename は実行されない
    expect(renamePageSpy).not.toHaveBeenCalled()
  })
})
