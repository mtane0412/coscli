/**
 * pages.test.ts — core/pages ユースケース層の単体テスト。
 *
 * CosenseRestClient をモックに差し替えてユースケース関数を検証する。
 * 実際の HTTP 通信は行わない。
 */

import { describe, expect, it, mock } from "bun:test"
import type { CosenseRestClient } from "@/core/api/rest"
import type { PatchMetadata, ScrapboxWriter } from "@/core/api/ws"
import { CommitConflictError } from "@/core/errors"
import {
  appendToPage,
  createPage,
  deleteLinesFromPage,
  deletePage,
  editPage,
  getCodeBlock,
  getPage,
  getPageText,
  insertIntoPage,
  listPages,
  pinPage,
  prependToPage,
  renamePage,
  replaceLinesInPage,
  unpinPage,
} from "@/core/pages"

/** REST クライアントのモック */
function createMockRestClient(overrides: Partial<CosenseRestClient> = {}): CosenseRestClient {
  return {
    getMe: mock(async () => ({ id: "user1", name: "テストユーザー", csrfToken: "csrf-token" })),
    listPages: mock(async () => ({
      projectName: "テストプロジェクト",
      skip: 0,
      limit: 30,
      count: 1,
      pages: [
        {
          id: "page1",
          title: "テストページ",
          updated: 1700000000,
          accessed: 1700000001,
          views: 10,
          linked: 2,
          commitId: "abc",
          snapshotCreated: null,
          persistent: true,
          image: null,
          pin: 0,
          pageRank: 0.1,
          descriptions: ["概要行"],
        },
      ],
    })),
    getPage: mock(async () => ({
      id: "page1",
      title: "テストページ",
      updated: 1700000000,
      accessed: 1700000001,
      views: 10,
      linked: 2,
      commitId: "abc",
      snapshotCreated: null,
      persistent: true,
      image: null,
      pin: 0,
      pageRank: 0.1,
      descriptions: ["概要行"],
      lines: [{ id: "l1", text: "テストページ", userId: "u1", created: 0, updated: 0 }],
      relatedPages: { links1hop: [], links2hop: [], hasBackLinksOrIcons: false },
      collaborators: [],
    })),
    getPageText: mock(async () => "テストページ\n本文テキスト"),
    getCodeBlock: mock(async () => 'console.log("hello")'),
    searchPages: mock(async () => ({
      projectName: "テストプロジェクト",
      query: "テスト",
      limit: 10,
      count: 1,
      existsExactTitleMatch: false,
      pages: [],
    })),
    getProject: mock(async () => ({
      id: "proj1",
      name: "テストプロジェクト",
      displayName: "テストプロジェクト",
      publicVisible: true,
      loginStrategies: [],
      theme: "default",
      gyazoTeamsName: null,
      translation: false,
      infobox: false,
      created: 1700000000,
      updated: 1700000000,
      isMember: true,
    })),
    listProjects: mock(async () => ({ projects: [] })),
    ...overrides,
  } as unknown as CosenseRestClient
}

/** Writer のモック */
function createMockWriter(overrides: Partial<ScrapboxWriter> = {}): ScrapboxWriter {
  return {
    patch: mock(async () => ({ commitId: "commit1", pageId: "page1" })),
    insertLines: mock(async () => ({ commitId: "commit1" })),
    deletePage: mock(async () => ({ title: "テストページ" })),
    pinPage: mock(async () => ({ title: "ピン留めページ" })),
    unpinPage: mock(async () => ({ title: "ピン解除ページ" })),
    ...overrides,
  } as unknown as ScrapboxWriter
}

describe("listPages", () => {
  it("REST クライアントから pages リストを取得して返す", async () => {
    const client = createMockRestClient()
    const result = await listPages(client, { project: "テストプロジェクト" })
    expect(client.listPages).toHaveBeenCalledWith("テストプロジェクト", {})
    expect(result.pages[0]?.title).toBe("テストページ")
  })

  it("limit と sort オプションを REST クライアントに渡す", async () => {
    const client = createMockRestClient()
    await listPages(client, { project: "proj", limit: 5, sort: "updated" })
    expect(client.listPages).toHaveBeenCalledWith("proj", { limit: 5, sort: "updated" })
  })
})

describe("getPage", () => {
  it("タイトルを指定してページを取得する", async () => {
    const client = createMockRestClient()
    const result = await getPage(client, { project: "proj", title: "テストページ" })
    expect(client.getPage).toHaveBeenCalledWith("proj", "テストページ")
    expect(result.title).toBe("テストページ")
  })
})

describe("createPage", () => {
  it("Writer の patch を呼んでページを作成する", async () => {
    const writer = createMockWriter()
    const result = await createPage(writer, {
      project: "proj",
      title: "新しいページ",
      lines: ["行1", "行2"],
    })
    expect(writer.patch).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ commitId: "commit1" })
  })

  it("patch に previewLines としてコンテンツ行を渡す", async () => {
    let capturedPreviewLines: string[] | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedPreviewLines = opts.previewLines
        return { commitId: "create-commit", pageId: "page1" }
      }),
    })
    await createPage(writer, { project: "proj", title: "新しいページ", lines: ["行1", "行2"] })
    expect(capturedPreviewLines).toEqual(["行1", "行2"])
  })
})

describe("appendToPage", () => {
  it("Writer の insertLines を呼んで行を追加する", async () => {
    const writer = createMockWriter()
    await appendToPage(writer, {
      project: "proj",
      title: "既存ページ",
      lines: ["追加行"],
    })
    expect(writer.insertLines).toHaveBeenCalledWith({
      project: "proj",
      title: "既存ページ",
      lines: ["追加行"],
    })
  })
})

describe("getPageText", () => {
  it("ページのテキスト本文を取得する", async () => {
    const client = createMockRestClient()
    const result = await getPageText(client, { project: "proj", title: "テストページ" })
    expect(client.getPageText).toHaveBeenCalledWith("proj", "テストページ")
    expect(result).toContain("テストページ")
  })
})

describe("getCodeBlock", () => {
  it("コードブロックを取得する", async () => {
    const client = createMockRestClient()
    const result = await getCodeBlock(client, {
      project: "proj",
      title: "テストページ",
      filename: "main.ts",
    })
    expect(client.getCodeBlock).toHaveBeenCalledWith("proj", "テストページ", "main.ts")
    expect(result).toContain("hello")
  })
})

/** update クロージャを実際に呼び出すモックライター生成ヘルパー */
function createMetadataInvokingWriter(metadata: PatchMetadata) {
  const writer = createMockWriter({
    patch: mock(async (opts) => {
      // @cosense/std の retry 動作をシミュレートするため update を metadata 付きで呼び出す
      await opts.update([], metadata)
      return { commitId: "更新後コミット", pageId: "page1" }
    }),
  })
  return writer
}

describe("editPage", () => {
  it("Writer の patch を呼んでページを全置換する", async () => {
    const writer = createMockWriter()
    await editPage(writer, { project: "proj", title: "既存ページ", lines: ["新しい内容"] })
    expect(writer.patch).toHaveBeenCalledTimes(1)
  })

  it("patch に previewLines として新しいコンテンツ行を渡す", async () => {
    let capturedPreviewLines: string[] | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedPreviewLines = opts.previewLines
        return { commitId: "edit-commit", pageId: "page1" }
      }),
    })
    await editPage(writer, { project: "proj", title: "既存ページ", lines: ["新しい内容"] })
    expect(capturedPreviewLines).toEqual(["新しい内容"])
  })

  it("force: false (デフォルト), attempts: 0 の場合は正常に完了する", async () => {
    // リトライなし (attempts=0) は競合なしとみなして正常終了すること
    const writer = createMetadataInvokingWriter({ attempts: 0, commitId: "コミット" })
    await expect(
      editPage(writer, { project: "proj", title: "ページ", lines: ["内容"] }),
    ).resolves.toMatchObject({ commitId: "更新後コミット" })
  })

  it("force: false, attempts: 1 の場合は CommitConflictError をスローする (楽観ロック)", async () => {
    // attempts=1 は他者がページを更新してリトライが発生したことを示す → CommitConflictError
    const writer = createMetadataInvokingWriter({ attempts: 1, commitId: "競合コミット" })
    await expect(
      editPage(writer, { project: "proj", title: "ページ", lines: ["内容"], force: false }),
    ).rejects.toBeInstanceOf(CommitConflictError)
  })

  it("force: true, attempts: 1 の場合は CommitConflictError をスローしない (上書き許可)", async () => {
    // --force 時は楽観ロックを無効化して上書きを許可する
    const writer = createMetadataInvokingWriter({ attempts: 1, commitId: "競合コミット" })
    await expect(
      editPage(writer, { project: "proj", title: "ページ", lines: ["内容"], force: true }),
    ).resolves.toMatchObject({ commitId: "更新後コミット" })
  })

  it("expectCommitId が一致する場合は正常に完了する", async () => {
    // --expect-commit で指定した commitId とサーバーの commitId が一致 → 正常
    const writer = createMetadataInvokingWriter({ attempts: 0, commitId: "期待コミット" })
    await expect(
      editPage(writer, {
        project: "proj",
        title: "ページ",
        lines: ["内容"],
        expectCommitId: "期待コミット",
      }),
    ).resolves.toMatchObject({ commitId: "更新後コミット" })
  })

  it("expectCommitId が不一致の場合は CommitConflictError をスローする", async () => {
    // --expect-commit の値とサーバーの commitId が不一致 → CommitConflictError
    const writer = createMetadataInvokingWriter({ attempts: 0, commitId: "実際のコミット" })
    const err = await editPage(writer, {
      project: "proj",
      title: "ページ",
      lines: ["内容"],
      expectCommitId: "期待コミット",
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CommitConflictError)
    expect((err as CommitConflictError).expectedCommitId).toBe("期待コミット")
    expect((err as CommitConflictError).actualCommitId).toBe("実際のコミット")
  })
})

describe("deletePage", () => {
  it("Writer の deletePage を呼んでページを削除する", async () => {
    const writer = createMockWriter()
    await deletePage(writer, { project: "proj", title: "削除ページ" })
    expect(writer.deletePage).toHaveBeenCalledWith({ project: "proj", title: "削除ページ" })
  })
})

describe("renamePage", () => {
  it("patch に previewLines として新タイトルを渡す", async () => {
    let capturedPreviewLines: string[] | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedPreviewLines = opts.previewLines
        return { commitId: "rename-commit", pageId: "page1" }
      }),
    })
    await renamePage(writer, { project: "proj", title: "旧タイトル", newTitle: "新タイトル" })
    // dry-run 時に変更後のタイトルが分かるよう、previewLines に新タイトルを設定する
    expect(capturedPreviewLines).toEqual(["新タイトル"])
  })

  it("patch の update 関数が新タイトルを先頭にした配列を返す", async () => {
    // update 関数の戻り値をキャプチャするためにモックを差し替える
    let capturedUpdate:
      | ((
          lines: { id: string; text: string; userId: string; created: number; updated: number }[],
        ) => string[] | Promise<string[]>)
      | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedUpdate = opts.update
        return { commitId: "rename-commit", pageId: "page1" }
      }),
    })
    await renamePage(writer, { project: "proj", title: "旧タイトル", newTitle: "新タイトル" })
    expect(writer.patch).toHaveBeenCalledTimes(1)

    // update 関数を実際に呼んで戻り値を検証する
    const existingLines = [
      { id: "l1", text: "旧タイトル", userId: "u1", created: 0, updated: 0 },
      { id: "l2", text: "本文1行目", userId: "u1", created: 0, updated: 0 },
      { id: "l3", text: "本文2行目", userId: "u1", created: 0, updated: 0 },
    ]
    const result = await capturedUpdate?.(existingLines)
    expect(result).toEqual(["新タイトル", "本文1行目", "本文2行目"])
  })
})

describe("prependToPage", () => {
  it("patch に previewLines として挿入行を渡す", async () => {
    let capturedPreviewLines: string[] | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedPreviewLines = opts.previewLines
        return { commitId: "prepend-commit", pageId: "page1" }
      }),
    })
    await prependToPage(writer, {
      project: "proj",
      title: "既存ページ",
      lines: ["先頭行1", "先頭行2"],
    })
    expect(capturedPreviewLines).toEqual(["先頭行1", "先頭行2"])
  })

  it("patch の update 関数がタイトル直後に新行を挿入した配列を返す", async () => {
    let capturedUpdate:
      | ((
          lines: { id: string; text: string; userId: string; created: number; updated: number }[],
        ) => string[] | Promise<string[]>)
      | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedUpdate = opts.update
        return { commitId: "prepend-commit", pageId: "page1" }
      }),
    })
    await prependToPage(writer, {
      project: "proj",
      title: "既存ページ",
      lines: ["先頭追加行1", "先頭追加行2"],
    })
    expect(writer.patch).toHaveBeenCalledTimes(1)

    const existingLines = [
      { id: "l1", text: "既存ページ", userId: "u1", created: 0, updated: 0 },
      { id: "l2", text: "既存本文", userId: "u1", created: 0, updated: 0 },
    ]
    const result = await capturedUpdate?.(existingLines)
    expect(result).toEqual(["既存ページ", "先頭追加行1", "先頭追加行2", "既存本文"])
  })

  it("本文が空ページでもタイトル直後に行を挿入できる", async () => {
    let capturedUpdate:
      | ((
          lines: { id: string; text: string; userId: string; created: number; updated: number }[],
        ) => string[] | Promise<string[]>)
      | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedUpdate = opts.update
        return { commitId: "prepend-commit", pageId: "page1" }
      }),
    })
    await prependToPage(writer, { project: "proj", title: "空ページ", lines: ["新しい行"] })

    // タイトル行のみのページ
    const existingLines = [{ id: "l1", text: "空ページ", userId: "u1", created: 0, updated: 0 }]
    const result = await capturedUpdate?.(existingLines)
    expect(result).toEqual(["空ページ", "新しい行"])
  })
})

describe("insertIntoPage", () => {
  it("patch に previewLines として挿入行を渡す", async () => {
    let capturedPreviewLines: string[] | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedPreviewLines = opts.previewLines
        return { commitId: "insert-commit", pageId: "page1" }
      }),
    })
    await insertIntoPage(writer, {
      project: "proj",
      title: "挿入ページ",
      after: 1,
      lines: ["挿入行1", "挿入行2"],
    })
    expect(capturedPreviewLines).toEqual(["挿入行1", "挿入行2"])
  })

  it("--after 2 で 2 行目の後ろに行を挿入する (1-indexed)", async () => {
    let capturedUpdate:
      | ((
          lines: { id: string; text: string; userId: string; created: number; updated: number }[],
        ) => string[] | Promise<string[]>)
      | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedUpdate = opts.update
        return { commitId: "insert-commit", pageId: "page1" }
      }),
    })
    await insertIntoPage(writer, {
      project: "proj",
      title: "挿入ページ",
      after: 2,
      lines: ["挿入行"],
    })
    expect(writer.patch).toHaveBeenCalledTimes(1)

    const existingLines = [
      { id: "l1", text: "挿入ページ", userId: "u1", created: 0, updated: 0 },
      { id: "l2", text: "本文1行目", userId: "u1", created: 0, updated: 0 },
      { id: "l3", text: "本文2行目", userId: "u1", created: 0, updated: 0 },
    ]
    const result = await capturedUpdate?.(existingLines)
    expect(result).toEqual(["挿入ページ", "本文1行目", "挿入行", "本文2行目"])
  })

  it("--after 0 (範囲外) の場合は update 関数が例外をスローする", async () => {
    let capturedUpdate:
      | ((
          lines: { id: string; text: string; userId: string; created: number; updated: number }[],
        ) => string[] | Promise<string[]>)
      | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedUpdate = opts.update
        return { commitId: "insert-commit", pageId: "page1" }
      }),
    })
    await insertIntoPage(writer, { project: "proj", title: "ページ", after: 0, lines: ["行"] })

    const existingLines = [{ id: "l1", text: "ページ", userId: "u1", created: 0, updated: 0 }]
    expect(() => capturedUpdate?.(existingLines)).toThrow("範囲外")
  })

  it("lines 数を超える --after (範囲外) の場合は update 関数が例外をスローする", async () => {
    let capturedUpdate:
      | ((
          lines: { id: string; text: string; userId: string; created: number; updated: number }[],
        ) => string[] | Promise<string[]>)
      | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedUpdate = opts.update
        return { commitId: "insert-commit", pageId: "page1" }
      }),
    })
    await insertIntoPage(writer, { project: "proj", title: "ページ", after: 99, lines: ["行"] })

    const existingLines = [
      { id: "l1", text: "ページ", userId: "u1", created: 0, updated: 0 },
      { id: "l2", text: "本文", userId: "u1", created: 0, updated: 0 },
    ]
    expect(() => capturedUpdate?.(existingLines)).toThrow("範囲外")
  })
})

/** update 関数をキャプチャするライター生成ヘルパー */
function createUpdateCapturingWriter() {
  let capturedUpdate:
    | ((
        lines: { id: string; text: string; userId: string; created: number; updated: number }[],
      ) => string[] | Promise<string[]>)
    | undefined
  const writer = createMockWriter({
    patch: mock(async (opts) => {
      capturedUpdate = opts.update
      return { commitId: "ダミーコミットID", pageId: "ダミーページID" }
    }),
  })
  return { writer, getUpdate: () => capturedUpdate }
}

/** 5 行のサンプルページ (タイトル + 4 行の本文) */
const sampleLines = [
  { id: "l0", text: "サンプルページ", userId: "u1", created: 0, updated: 0 },
  { id: "l1", text: "本文1行目", userId: "u1", created: 0, updated: 0 },
  { id: "l2", text: "本文2行目", userId: "u1", created: 0, updated: 0 },
  { id: "l3", text: "本文3行目", userId: "u1", created: 0, updated: 0 },
  { id: "l4", text: "本文4行目", userId: "u1", created: 0, updated: 0 },
]

describe("replaceLinesInPage", () => {
  it("単一行 (start=end=3) を置換する", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await replaceLinesInPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 3,
      end: 3,
      lines: ["置換後3行目"],
    })
    const result = await getUpdate()?.(sampleLines)
    // 3行目が置換され、他の行は変わらない
    expect(result).toEqual(["サンプルページ", "本文1行目", "置換後3行目", "本文3行目", "本文4行目"])
  })

  it("範囲 (start=2, end=3) を 2 行で置換する (行数同等)", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await replaceLinesInPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 2,
      end: 3,
      lines: ["置換A", "置換B"],
    })
    const result = await getUpdate()?.(sampleLines)
    expect(result).toEqual(["サンプルページ", "置換A", "置換B", "本文3行目", "本文4行目"])
  })

  it("1 行を 2 行に置換する (行数増加)", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await replaceLinesInPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 2,
      end: 2,
      lines: ["増加A", "増加B"],
    })
    const result = await getUpdate()?.(sampleLines)
    expect(result).toEqual([
      "サンプルページ",
      "増加A",
      "増加B",
      "本文2行目",
      "本文3行目",
      "本文4行目",
    ])
  })

  it("3 行を 1 行に置換する (行数減少)", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await replaceLinesInPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 2,
      end: 4,
      lines: ["凝縮行"],
    })
    const result = await getUpdate()?.(sampleLines)
    expect(result).toEqual(["サンプルページ", "凝縮行", "本文4行目"])
  })

  it("end が行数を超える場合は update 関数が例外をスローする", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await replaceLinesInPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 2,
      end: 99,
      lines: ["行"],
    })
    expect(() => getUpdate()?.(sampleLines)).toThrow("範囲外")
  })

  it("start=1 (タイトル行) の場合は update 関数が例外をスローする", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await replaceLinesInPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 1,
      end: 1,
      lines: ["タイトル変更試み"],
    })
    expect(() => getUpdate()?.(sampleLines)).toThrow("タイトル行")
  })

  it("previewLines として新しい行を渡す", async () => {
    let capturedPreviewLines: string[] | undefined
    const writer = createMockWriter({
      patch: mock(async (opts) => {
        capturedPreviewLines = opts.previewLines
        return { commitId: "replace-commit", pageId: "page1" }
      }),
    })
    await replaceLinesInPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 2,
      end: 2,
      lines: ["新しい行"],
      previewLines: ["新しい行"],
    })
    expect(capturedPreviewLines).toEqual(["新しい行"])
  })
})

describe("deleteLinesFromPage", () => {
  it("単一行 (start=end=3) を削除する", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await deleteLinesFromPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 3,
      end: 3,
    })
    const result = await getUpdate()?.(sampleLines)
    // 3行目が削除され、他の行は変わらない
    expect(result).toEqual(["サンプルページ", "本文1行目", "本文3行目", "本文4行目"])
  })

  it("範囲 (start=2, end=4) を削除する", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await deleteLinesFromPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 2,
      end: 4,
    })
    const result = await getUpdate()?.(sampleLines)
    expect(result).toEqual(["サンプルページ", "本文4行目"])
  })

  it("end が行数を超える場合は update 関数が例外をスローする", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await deleteLinesFromPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 2,
      end: 99,
    })
    expect(() => getUpdate()?.(sampleLines)).toThrow("範囲外")
  })

  it("start=1 (タイトル行) の場合は update 関数が例外をスローする", async () => {
    const { writer, getUpdate } = createUpdateCapturingWriter()
    await deleteLinesFromPage(writer, {
      project: "proj",
      title: "サンプルページ",
      start: 1,
      end: 2,
    })
    expect(() => getUpdate()?.(sampleLines)).toThrow("タイトル行")
  })
})

describe("pinPage", () => {
  it("Writer の pinPage を正しい引数で呼ぶ", async () => {
    const writer = createMockWriter()
    await pinPage(writer, { project: "proj", title: "ピンページ", create: true })
    expect(writer.pinPage).toHaveBeenCalledWith({
      project: "proj",
      title: "ピンページ",
      create: true,
    })
  })
})

describe("unpinPage", () => {
  it("Writer の unpinPage を正しい引数で呼ぶ", async () => {
    const writer = createMockWriter()
    await unpinPage(writer, { project: "proj", title: "ピン解除ページ" })
    expect(writer.unpinPage).toHaveBeenCalledWith({
      project: "proj",
      title: "ピン解除ページ",
    })
  })
})
