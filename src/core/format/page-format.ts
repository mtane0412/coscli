/**
 * page-format.ts — page get --format ディスパッチャが共有するフォーマットロジック。
 *
 * `cos page get --format=<value>` の各 format 処理関数と、
 * `cos page context` でも使われる filterSmartContextByQuery を提供する。
 *
 * このファイルは commands 層から独立した core 層に置く。
 * これにより `page get` と `page context` の両コマンドが同じロジックを参照できる。
 */

/** Smart Context XML 形式のページブロック抽出パターン。<Page ...>...</Page> 単位でマッチ。 */
const XML_PAGE_BLOCK_PATTERN = /<Page\s[^>]*>[\s\S]*?<\/Page>/g

/** Smart Context テキストのページセクション区切り行 (==[ページタイトル]== 形式)。m フラグで行単位にマッチ。 */
const SECTION_MARKER_PATTERN = /^==[^=\n]+==$/m

/**
 * filterSmartContextByQuery は Smart Context テキストをクエリキーワードでフィルタする。
 *
 * フォーマット検出の優先順位:
 *   1. `<Page title="...">...</Page>` XML 形式 (実際の Smart Context API が返す形式)
 *   2. `==[title]==` マーカー行形式 (旧形式フォールバック)
 *   3. 空行区切り形式 (その他フォールバック)
 *
 * XML 形式の場合は `<Page>...</Page>` ブロック単位でフィルタする。
 * クエリは大文字・小文字を区別しない。query が空文字のときはフィルタせず全文を返す。
 */
export function filterSmartContextByQuery(text: string, query: string): string {
  if (!query) return text
  const lowerQuery = query.toLowerCase()

  // <Page title="..."> ... </Page> XML 形式
  if (/<Page\s+title=/.test(text)) {
    const allBlocks: string[] = []
    const regex = new RegExp(XML_PAGE_BLOCK_PATTERN.source, "g")
    let match = regex.exec(text)
    while (match !== null) {
      allBlocks.push(match[0])
      match = regex.exec(text)
    }
    const filtered = allBlocks.filter((block) => block.toLowerCase().includes(lowerQuery))
    return filtered.join("\n\n\n")
  }

  // ==[title]== マーカー行形式
  if (SECTION_MARKER_PATTERN.test(text)) {
    const lines = text.split("\n")
    const sections: string[] = []
    let currentLines: string[] = []

    for (const line of lines) {
      if (SECTION_MARKER_PATTERN.test(line) && currentLines.length > 0) {
        sections.push(currentLines.join("\n"))
        currentLines = [line]
      } else {
        currentLines.push(line)
      }
    }
    if (currentLines.length > 0) {
      sections.push(currentLines.join("\n"))
    }

    const filtered = sections.filter((s) => s.toLowerCase().includes(lowerQuery))
    return filtered.join("\n")
  }

  // フォールバック: 1 行以上の空行でページセクションを分割する
  const sections = text.split(/\n{2,}/)
  const filtered = sections.filter((section) => section.toLowerCase().includes(lowerQuery))
  return filtered.join("\n\n")
}
