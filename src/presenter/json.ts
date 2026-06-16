/**
 * json.ts — --json / --results-only / --select 出力フォーマット。
 *
 * すべての出力を envelope 形式 { data, meta } で包み、
 * --results-only で data だけを、--select で特定のパスを抽出して出力する。
 */

import { randomUUID } from "node:crypto"

/** ResponseEnvelopeMeta は CLI 出力 envelope の meta フィールド。 */
export interface ResponseEnvelopeMeta {
  /** 実行されたコマンド識別子 (deprecated alias の場合は旧識別子のまま) */
  command: string
  /** ミリ秒単位の実行時間 */
  durationMs: number
  /** リクエスト追跡用 UUID */
  requestId: string
  /** 警告メッセージリスト */
  warnings: string[]
  /**
   * 正規コマンド識別子 (deprecated alias 経由で実行された場合のみ設定)。
   *
   * エージェントが次のターンで使うべき正規コマンド ID を示す。
   * command フィールドとの使い分け:
   *   - command: sandbox 識別子として使用 (後方互換を維持)
   *   - canonicalCommand: エージェントが学ぶべき正規 ID
   */
  canonicalCommand?: string
  /**
   * 非推奨情報 (deprecated alias 経由で実行された場合のみ設定)。
   *
   * エージェントが次のターンで正規コマンドに切り替えるための移行情報。
   */
  deprecated?: {
    since: string
    replacement: string
  }
}

/** ResponseEnvelope は CLI の標準出力 envelope 形式。 */
export interface ResponseEnvelope<T> {
  data: T
  meta: ResponseEnvelopeMeta
}

/** ErrorEnvelope はエラー時の出力形式。 */
export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    hint?: string
  }
  data?: unknown
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

/** WriteJsonMeta は writeJson に渡す meta 引数の型。 */
export interface WriteJsonMeta {
  /** コマンド識別子 */
  command: string
  /** 開始時刻 (Date.now()) */
  startTime: number
  /** 警告メッセージリスト */
  warnings?: string[]
  /**
   * 正規コマンド識別子 (deprecated alias 経由の場合のみ指定)。
   *
   * 指定すると envelope の meta.canonicalCommand に出力される。
   */
  canonicalCommand?: string
  /**
   * 非推奨情報 (deprecated alias 経由の場合のみ指定)。
   *
   * 指定すると envelope の meta.deprecated に出力される。
   */
  deprecated?: {
    since: string
    replacement: string
  }
}

/** writeJson は envelope を JSON として stdout に書き出す。 */
export function writeJson<T>(data: T, meta: WriteJsonMeta, opts: JsonOutputOptions = {}): void {
  const stream = opts.stream ?? process.stdout
  const durationMs = Date.now() - meta.startTime

  let output: unknown
  if (opts.resultsOnly) {
    output = applySelect(data, opts.select)
  } else {
    const envelopeMeta: ResponseEnvelopeMeta = {
      command: meta.command,
      durationMs,
      requestId: randomUUID(),
      warnings: meta.warnings ?? [],
    }
    // 省略可能フィールドは値がある場合のみ出力する (後方互換)
    if (meta.canonicalCommand !== undefined) {
      envelopeMeta.canonicalCommand = meta.canonicalCommand
    }
    if (meta.deprecated !== undefined) {
      envelopeMeta.deprecated = meta.deprecated
    }
    const envelope: ResponseEnvelope<T> = { data, meta: envelopeMeta }
    output = opts.select ? applySelect(envelope.data, opts.select) : envelope
  }

  stream.write(`${JSON.stringify(output, null, 2)}\n`)
}

/**
 * writeJsonLine はデータを 1 行の JSON (NDJSON) として stdout に書き出す。
 *
 * `cos page watch` のような継続ストリーミング出力に使用する。
 * インデントなし・改行終端の 1 行 JSON を出力する。
 */
export function writeJsonLine(data: unknown, opts: { stream?: NodeJS.WritableStream } = {}): void {
  const out = opts.stream ?? process.stdout
  out.write(`${JSON.stringify(data)}\n`)
}

/** writeErrorJson はエラーを JSON として stdout に書き出す。data を渡すと envelope の data フィールドに含まれる。 */
export function writeErrorJson(
  code: string,
  message: string,
  hint?: string,
  data?: unknown,
  stream?: NodeJS.WritableStream,
): void {
  const out = stream ?? process.stdout
  const envelope: ErrorEnvelope = {
    error: { code, message, ...(hint ? { hint } : {}) },
    ...(data !== undefined ? { data } : {}),
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
