/**
 * range.ts — 行指定 (--line / --range) のパース。
 *
 * `--line <n>` または `--range a:b` を 1-indexed の {start, end} に変換する。
 * 両端含む。タイトル行 (index=1) の保護は呼び出し側で行う。
 */

/** RangeSpecError は --line / --range の指定が不正な場合のエラー。 */
export class RangeSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RangeSpecError"
  }
}

/** 正の整数文字列にマッチする正規表現 (1-indexed 用)。 */
const POSITIVE_INT_RE = /^[1-9]\d*$/

/**
 * parseLineSpec は --line / --range フラグを {start, end} に変換する。
 *
 * @param args.line - --line フラグの値 (文字列の正の整数)
 * @param args.range - --range フラグの値 ("a:b" 形式)
 * @returns 1-indexed の {start, end} (両端含む)
 * @throws RangeSpecError フラグが不正または両方指定/未指定の場合
 */
export function parseLineSpec(args: {
  line?: string
  range?: string
}): { start: number; end: number } {
  const hasLine = args.line !== undefined && args.line !== ""
  const hasRange = args.range !== undefined && args.range !== ""

  // 両方同時指定は禁止
  if (hasLine && hasRange) {
    throw new RangeSpecError("--line と --range を同時に指定することはできません")
  }

  // 両方未指定も禁止
  if (!hasLine && !hasRange) {
    throw new RangeSpecError("--line または --range のいずれかを指定してください")
  }

  if (hasLine) {
    return parseLine(args.line as string)
  }

  return parseRange(args.range as string)
}

/** parseLine は --line の値を {start, end} に変換する。 */
function parseLine(value: string): { start: number; end: number } {
  if (!POSITIVE_INT_RE.test(value)) {
    throw new RangeSpecError(`--line の値が無効です: "${value}" (1 以上の整数を指定してください)`)
  }
  const n = Number.parseInt(value, 10)
  return { start: n, end: n }
}

/** parseRange は --range の値を {start, end} に変換する。 */
function parseRange(value: string): { start: number; end: number } {
  // a:b 形式の検証
  const parts = value.split(":")
  if (parts.length !== 2) {
    throw new RangeSpecError(
      `--range の値が無効です: "${value}" (a:b 形式で正の整数を指定してください)`,
    )
  }

  const aStr = parts[0] ?? ""
  const bStr = parts[1] ?? ""

  if (!POSITIVE_INT_RE.test(aStr) || !POSITIVE_INT_RE.test(bStr)) {
    throw new RangeSpecError(
      `--range の値が無効です: "${value}" (a:b 形式で 1 以上の整数を指定してください)`,
    )
  }

  const a = Number.parseInt(aStr, 10)
  const b = Number.parseInt(bStr, 10)

  if (a > b) {
    throw new RangeSpecError(`--range の値が無効です: "${value}" (a≤b となるよう指定してください)`)
  }

  return { start: a, end: b }
}
