/**
 * encoder.ts — Cosense ページタイトルの URL スラッグ変換ユーティリティ。
 *
 * Cosense の URL 規則: 半角スペースを `_` に置換した後 encodeURIComponent する。
 * パーセントエンコードした `_` (%5F) とリテラルの `_` は区別されないため、
 * アンダースコアそのものは RFC 3986 の unreserved 文字としてそのまま使う。
 */

const BASE_URL = "https://scrapbox.io"

/** encodePageTitle はページタイトルを Cosense URL スラッグ形式に変換する。 */
export function encodePageTitle(title: string): string {
  // 半角スペースのみアンダースコアに置換し、その後 encodeURIComponent する
  return encodeURIComponent(title.replaceAll(" ", "_")).replaceAll("%5F", "_")
}

/** decodePageTitle は Cosense URL スラッグをページタイトルに戻す。 */
export function decodePageTitle(slug: string): string {
  return decodeURIComponent(slug.replaceAll("_", " "))
}

/** buildPageUrl はプロジェクト名とタイトルから Cosense ページ URL を生成する。 */
export function buildPageUrl(project: string, title: string): string {
  if (!project) throw new Error("プロジェクト名を指定してください")
  if (!title) throw new Error("タイトルを指定してください")
  return `${BASE_URL}/${encodeURIComponent(project)}/${encodePageTitle(title)}`
}

/** buildIconUrl はページアイコン取得 URL を生成する (API 呼び出しなし)。 */
export function buildIconUrl(project: string, title: string): string {
  if (!project) throw new Error("プロジェクト名を指定してください")
  if (!title) throw new Error("タイトルを指定してください")
  return `${BASE_URL}/api/pages/${encodeURIComponent(project)}/${encodePageTitle(title)}/icon`
}
