/**
 * args.ts — CLI 引数のプリプロセスユーティリティ。
 *
 * citty はルートレベルの string 型フラグをスペース区切りで受け取ると
 * 次トークンをサブコマンド候補として誤認識する。
 * normalizeRootStringFlags は渡した rawArgs を走査し、
 * `--flag value` 形式を `--flag=value` 形式に変換することでこの問題を回避する。
 */

/**
 * normalizeRootStringFlags は `--flag value` 形式の string フラグを
 * `--flag=value` 形式に正規化した新しい配列を返す。
 *
 * @param args - process.argv.slice(2) 等の生の引数配列
 * @param stringFlags - 変換対象のフラグ名一覧 (先頭の -- を除いた形式: "color", "enable-commands" 等)
 * @returns 正規化後の引数配列
 */
export function normalizeRootStringFlags(args: string[], stringFlags: string[]): string[] {
  // 高速な O(1) 探索のため Set に変換する
  const flagNames = new Set(stringFlags.map((f) => `--${f}`))
  const result: string[] = []
  let i = 0

  while (i < args.length) {
    const arg = args[i]
    // noUncheckedIndexedAccess: i < args.length で存在が保証されているが型上は undefined になり得る
    if (arg === undefined) break
    const nextArg = args[i + 1]

    // `--flag` 形式 (= を含まない) かつ次トークンが存在し、- で始まらない場合のみ変換する
    if (flagNames.has(arg) && nextArg !== undefined && !nextArg.startsWith("-")) {
      result.push(`${arg}=${nextArg}`)
      i += 2
    } else {
      result.push(arg)
      i++
    }
  }

  return result
}
