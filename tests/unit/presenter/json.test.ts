/**
 * json.test.ts — presenter/json の単体テスト。
 *
 * writeJson / writeErrorJson は出力先 stream を差し替えて検証する。
 * applySelect は純粋関数なので直接テストする。
 */

import { describe, expect, it } from "bun:test"
import { applySelect, writeErrorJson, writeJson, writeJsonLine } from "@/presenter/json"

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

  it("canonicalCommand が指定された場合は meta.canonicalCommand に含める", () => {
    const stream = createMockStream()
    writeJson(
      { title: "テストページ" },
      {
        command: "page.text",
        startTime: Date.now(),
        canonicalCommand: "page.get",
      },
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.meta.canonicalCommand).toBe("page.get")
  })

  it("deprecated が指定された場合は meta.deprecated に含める", () => {
    const stream = createMockStream()
    writeJson(
      { title: "テストページ" },
      {
        command: "page.text",
        startTime: Date.now(),
        deprecated: { since: "v2.0.0", replacement: "page get --format=text" },
      },
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.meta.deprecated).toEqual({
      since: "v2.0.0",
      replacement: "page get --format=text",
    })
  })

  it("canonicalCommand が未指定の場合は meta.canonicalCommand を含まない (後方互換)", () => {
    const stream = createMockStream()
    writeJson(
      {},
      { command: "page.get", startTime: Date.now() },
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.meta.canonicalCommand).toBeUndefined()
  })

  it("deprecated が未指定の場合は meta.deprecated を含まない (後方互換)", () => {
    const stream = createMockStream()
    writeJson(
      {},
      { command: "page.get", startTime: Date.now() },
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.meta.deprecated).toBeUndefined()
  })
})

describe("writeErrorJson", () => {
  it("error フィールドを含む JSON を出力する", () => {
    const stream = createMockStream()
    writeErrorJson(
      "NOT_FOUND",
      "ページが見つかりません",
      undefined,
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
      undefined,
      stream as unknown as NodeJS.WritableStream,
    )
    const parsed = JSON.parse(stream.output)
    expect(parsed.error.hint).toBe("`cos auth login` を実行してください")
  })
})

describe("writeJsonLine", () => {
  it("データを 1 行の JSON として出力する (改行終端あり)", () => {
    const stream = createMockStream()
    writeJsonLine(
      { commitId: "abc123", userId: "山田太郎" },
      { stream: stream as unknown as NodeJS.WritableStream },
    )
    // 改行で終わる 1 行 JSON であること
    expect(stream.output.endsWith("\n")).toBe(true)
    const line = stream.output.trim()
    const parsed = JSON.parse(line)
    expect(parsed.commitId).toBe("abc123")
    expect(parsed.userId).toBe("山田太郎")
  })

  it("複数回呼ぶと NDJSON (改行区切り複数行) になる", () => {
    const stream = createMockStream()
    writeJsonLine({ event: "第1コミット" }, { stream: stream as unknown as NodeJS.WritableStream })
    writeJsonLine({ event: "第2コミット" }, { stream: stream as unknown as NodeJS.WritableStream })
    const lines = stream.output.trim().split("\n")
    expect(lines.length).toBe(2)
    const parsed0 = JSON.parse(lines[0] ?? "null") as { event?: string }
    const parsed1 = JSON.parse(lines[1] ?? "null") as { event?: string }
    expect(parsed0.event).toBe("第1コミット")
    expect(parsed1.event).toBe("第2コミット")
  })

  it("整形 JSON (インデントなし) で出力する", () => {
    const stream = createMockStream()
    writeJsonLine({ key: "値" }, { stream: stream as unknown as NodeJS.WritableStream })
    // 改行を除いた部分にインデントがないこと
    const line = stream.output.trim()
    expect(line).toBe('{"key":"値"}')
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
