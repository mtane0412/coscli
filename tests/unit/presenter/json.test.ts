/**
 * json.test.ts — presenter/json の単体テスト。
 *
 * writeJson / writeErrorJson は出力先 stream を差し替えて検証する。
 * applySelect は純粋関数なので直接テストする。
 */

import { describe, expect, it } from "bun:test"
import { applySelect, writeErrorJson, writeJson } from "@/presenter/json"

/** WritableStream の代わりに文字列を収集するモックストリーム */
function createMockStream() {
  let buffer = ""
  return {
    write(chunk: string) {
      buffer += chunk
    },
    get output(): string {
      return buffer
    },
  }
}

describe("writeJson", () => {
  it("data と meta を含む envelope を出力する", () => {
    const stream = createMockStream()
    writeJson(
      { name: "テストユーザー" },
      { command: "auth.whoami", startTime: Date.now() },
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.data).toEqual({ name: "テストユーザー" })
    expect(parsed.meta.command).toBe("auth.whoami")
    expect(typeof parsed.meta.durationMs).toBe("number")
    expect(typeof parsed.meta.requestId).toBe("string")
    expect(parsed.meta.warnings).toEqual([])
  })

  it("warnings が指定されている場合は meta.warnings に含める", () => {
    const stream = createMockStream()
    writeJson(
      {},
      { command: "page.list", startTime: Date.now(), warnings: ["ページ数が多いです"] },
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.meta.warnings).toEqual(["ページ数が多いです"])
  })

  it("resultsOnly=true の場合は data だけを出力する", () => {
    const stream = createMockStream()
    writeJson(
      [{ title: "ページ1" }, { title: "ページ2" }],
      { command: "page.list", startTime: Date.now() },
      { stream: stream as unknown as NodeJS.WritableStream, resultsOnly: true },
    )
    const parsed = JSON.parse(stream.output)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].title).toBe("ページ1")
  })

  it("select を指定するとデータを絞り込んで出力する", () => {
    const stream = createMockStream()
    writeJson(
      { pages: [{ title: "タイトルA" }, { title: "タイトルB" }] },
      { command: "page.list", startTime: Date.now() },
      { stream: stream as unknown as NodeJS.WritableStream, select: "pages[].title" },
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed).toEqual(["タイトルA", "タイトルB"])
  })

  it("resultsOnly + select を組み合わせると data に select を適用する", () => {
    const stream = createMockStream()
    writeJson(
      { pages: [{ title: "タイトルC" }], total: 1 },
      { command: "page.list", startTime: Date.now() },
      {
        stream: stream as unknown as NodeJS.WritableStream,
        resultsOnly: true,
        select: "pages[].title",
      },
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed).toEqual(["タイトルC"])
  })
})

describe("writeErrorJson", () => {
  it("error フィールドを含む JSON を出力する", () => {
    const stream = createMockStream()
    writeErrorJson(
      "NOT_FOUND",
      "ページが見つかりません",
      undefined,
      stream as unknown as NodeJS.WritableStream,
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.error.code).toBe("NOT_FOUND")
    expect(parsed.error.message).toBe("ページが見つかりません")
    expect(parsed.error.hint).toBeUndefined()
  })

  it("hint が指定されている場合は error.hint を含める", () => {
    const stream = createMockStream()
    writeErrorJson(
      "AUTH_FAILED",
      "認証に失敗しました",
      "`cos auth login` を実行してください",
      stream as unknown as NodeJS.WritableStream,
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.error.hint).toBe("`cos auth login` を実行してください")
  })
})

describe("applySelect", () => {
  const data = {
    pages: [
      { title: "ページA", author: "山田太郎" },
      { title: "ページB", author: "鈴木花子" },
    ],
    total: 2,
  }

  it("selector が undefined の場合はデータをそのまま返す", () => {
    expect(applySelect(data, undefined)).toBe(data)
  })

  it("トップレベルのキーを取得できる", () => {
    expect(applySelect(data, "total")).toBe(2)
  })

  it("ネストしたキーをドット区切りで取得できる", () => {
    const nested = { a: { b: { c: "深い値" } } }
    expect(applySelect(nested, "a.b.c")).toBe("深い値")
  })

  it("pages[] で配列を取得できる", () => {
    const result = applySelect(data, "pages[]")
    expect(Array.isArray(result)).toBe(true)
    expect((result as unknown[]).length).toBe(2)
  })

  it("pages[].title で配列の各要素のプロパティを取得できる", () => {
    expect(applySelect(data, "pages[].title")).toEqual(["ページA", "ページB"])
  })

  it("pages[].author で配列の各要素の別プロパティを取得できる", () => {
    expect(applySelect(data, "pages[].author")).toEqual(["山田太郎", "鈴木花子"])
  })

  it("存在しないキーは undefined を返す", () => {
    expect(applySelect(data, "存在しないキー")).toBeUndefined()
  })

  it("配列でない値に [] を適用すると undefined を返す", () => {
    expect(applySelect(data, "total[]")).toBeUndefined()
  })

  it("null データに対してはundefined を返す", () => {
    expect(applySelect(null, "pages")).toBeUndefined()
  })
})
