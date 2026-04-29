/**
 * json.ts — --json / --results-only / --select 出力フォーマット。
 *
 * すべての出力を envelope 形式 { data, meta } で包み、
 * --results-only で data だけを、--select で特定のパスを抽出して出力する。
 */

import { randomUUID } from "node:crypto"

/** ResponseEnvelope は CLI の標準出力 envelope 形式。 */
export interface ResponseEnvelope<T> {
  data: T
  meta: {
    command: string
    durationMs: number
    requestId: string
    warnings: string[]
  }
}

/** ErrorEnvelope はエラー時の出力形式。 */
export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    hint?: string
  }
}

/** JsonOutputOptions は JSON 出力のオプション。 */
export interface JsonOutputOptions {
  /** 出力先 (デフォルト process.stdout) */
  stream?: NodeJS.WritableStream
  /** true の場合 meta を省いて data だけを出力する */
  resultsOnly?: boolean
  /** jq 風の軽量パスセレクタ (例: "pages[].title") */
  select?: string
}

/** writeJson は envelope を JSON として stdout に書き出す。 */
export function writeJson<T>(
  data: T,
  meta: { command: string; startTime: number; warnings?: string[] },
  opts: JsonOutputOptions = {},
): void {
  const stream = opts.stream ?? process.stdout
  const durationMs = Date.now() - meta.startTime

  let output: unknown
  if (opts.resultsOnly) {
    output = applySelect(data, opts.select)
  } else {
    const envelope: ResponseEnvelope<T> = {
      data,
      meta: {
        command: meta.command,
        durationMs,
        requestId: randomUUID(),
        warnings: meta.warnings ?? [],
      },
    }
    output = opts.select ? applySelect(envelope.data, opts.select) : envelope
  }

  stream.write(`${JSON.stringify(output, null, 2)}\n`)
}

/** writeErrorJson はエラーを JSON として stdout に書き出す。 */
export function writeErrorJson(
  code: string,
  message: string,
  hint?: string,
  stream?: NodeJS.WritableStream,
): void {
  const out = stream ?? process.stdout
  const envelope: ErrorEnvelope = {
    error: { code, message, ...(hint ? { hint } : {}) },
  }
  out.write(`${JSON.stringify(envelope, null, 2)}\n`)
}

/**
 * applySelect は "a.b[].c" 形式の軽量パスセレクタを適用する。
 *
 * サポートする形式:
 *   - "pages"      → data.pages
 *   - "pages[]"    → data.pages の各要素
 *   - "pages[].title" → data.pages の各要素の title
 *   - "a.b.c"      → data.a.b.c
 */
export function applySelect(data: unknown, selector?: string): unknown {
  if (!selector) return data

  const parts = selector.split(".")
  let current: unknown = data

  for (const part of parts) {
    if (current === null || current === undefined) return undefined

    if (part.endsWith("[]")) {
      const key = part.slice(0, -2)
      const array = key ? (current as Record<string, unknown>)[key] : current
      if (!Array.isArray(array)) return undefined
      current = array
      // 次の part があればそれを各要素に適用する (ここでは current が配列のまま次へ)
    } else {
      if (Array.isArray(current)) {
        // 配列の各要素にキーを適用する
        current = current.map((item) =>
          item !== null && typeof item === "object"
            ? (item as Record<string, unknown>)[part]
            : undefined,
        )
      } else {
        current = (current as Record<string, unknown>)[part]
      }
    }
  }

  return current
}
