/**
 * resolve-version.ts — ビルドスクリプト用バージョン解決ユーティリティ。
 *
 * 優先順位:
 * 1. 環境変数 VERSION が空でない文字列であればその値を使用する (CI タグビルド等)
 * 2. それ以外は package.json の version フィールドを使用する
 * 3. どちらも取得できない場合は "dev" にフォールバックする
 */

/**
 * resolveVersion は VERSION 環境変数と package.json バージョンを合成して
 * 最終的なバージョン文字列を返す。
 *
 * @param envVersion - 環境変数 VERSION の値 (undefined または空文字の場合は無視)
 * @param pkgVersion - package.json の version フィールドの値
 * @returns 解決済みのバージョン文字列
 */
export function resolveVersion(
  envVersion: string | undefined,
  pkgVersion: string | undefined,
): string {
  // trim() で空白のみの値を無効扱いにする（設定ミス防止）
  const trimmedEnv = envVersion?.trim()
  if (trimmedEnv) return trimmedEnv
  const trimmedPkg = pkgVersion?.trim()
  if (trimmedPkg) return trimmedPkg
  return "dev"
}
