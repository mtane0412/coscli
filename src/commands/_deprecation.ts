/**
 * _deprecation.ts — コマンド非推奨警告のヘルパー。
 *
 * deprecated alias コマンドの実行時に [deprecated] 警告を stderr に出力する。
 * `--json` モードでは envelope の `meta.warnings` 配列にも追加できるよう
 * warnings 配列を受け取るオプション引数を持つ。
 *
 * `COS_SILENCE_DEPRECATION=1` 環境変数で警告を抑制できる (CI ノイズ低減用)。
 */

/** DEPRECATION_SINCE は deprecated alias が追加されたバージョン。 */
export const DEPRECATION_SINCE = "v0.10.0"

/**
 * warnDeprecated は deprecated alias コマンドの実行時に警告を出力する。
 *
 * @param oldCommand - 旧コマンド名 (例: "page text")
 * @param replacement - 移行先コマンド (例: "page get --format=text")
 * @param warnings - JSON 出力時に追加する warnings 配列 (省略可)
 */
export function warnDeprecated(oldCommand: string, replacement: string, warnings?: string[]): void {
  // COS_SILENCE_DEPRECATION=1 で警告を完全に抑制する
  if (process.env["COS_SILENCE_DEPRECATION"] === "1") return

  const message = `[deprecated] cos ${oldCommand} は非推奨です。代わりに 'cos ${replacement}' を使用してください。`
  process.stderr.write(`${message}\n`)

  if (warnings !== undefined) {
    warnings.push(message)
  }
}
