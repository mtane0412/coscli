/**
 * lint.ts — Cosense 記法の静的検査 (lintNotation)。
 *
 * エージェントが書き込み前・書き込み時に記法の誤用を検出するための
 * 軽量なルールエンジン。4ルールを実装する:
 *
 * 1. no-space-in-emphasis       — [*xxx] 等のスペース欠落
 * 2. reversed-heading-hierarchy — [* x] → [** y] の Markdown 的な逆転
 * 3. markdown-bold-residue      — **bold** / __bold__ の残留
 * 4. markdown-italic-residue    — *italic* / _italic_ の残留
 *
 * code:/table: ブロックとインラインコードは全ルールの対象外。
 */

/** NotationFinding は lint ルールの検出結果を表す。 */
export interface NotationFinding {
  /** 1-indexed 行番号 */
  line: number
  /** 1-indexed 列番号 (省略可) */
  column?: number
  /** ルール識別子 */
  rule: string
  /** 重大度 (初期版は warning のみ) */
  severity: "warning"
  /** 日本語の説明 */
  message: string
  /** 修正案 (省略可) */
  hint?: string
}

/**
 * lintNotation は Cosense ページのテキスト行を検査し、記法の誤用を返す。
 *
 * @param lines ページ本文を行分割した配列 (1行目がタイトルになる場合も含む)
 */
export function lintNotation(lines: string[]): NotationFinding[] {
  const findings: NotationFinding[] = []

  // code:/table: ブロックに属するかを追跡する
  let inBlock = false

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = lines[i] ?? ""

    // code: / table: ブロックの開始/終了を判定する
    // ブロック先頭行は "code:xxx" / "table:xxx" (インデントなし)、
    // 継続行はスペース or タブで始まる行
    if (!inBlock) {
      if (/^(?:code|table):/.test(raw)) {
        inBlock = true
        continue
      }
    } else {
      // 空行またはインデントのない行でブロック終了
      if (raw === "" || !/^[ \t]/.test(raw)) {
        inBlock = false
        // ブロック外に戻ったので今行を通常行として処理する
      } else {
        continue
      }
    }

    // インラインコード区間をマスクした検査用文字列を生成する
    // バッククォートで囲まれた範囲を空白に置換することで誤検出を防ぐ
    const masked = maskInlineCode(raw)

    // ルール 1: no-space-in-emphasis
    checkNoSpaceInEmphasis(masked, lineNo, findings)

    // ルール 3: markdown-bold-residue
    checkMarkdownBoldResidue(masked, lineNo, findings)

    // ルール 4: markdown-italic-residue
    checkMarkdownItalicResidue(masked, lineNo, findings)
  }

  // ルール 2: reversed-heading-hierarchy はドキュメント全体を走査する
  checkReversedHeadingHierarchy(lines, findings)

  return findings
}

// ──────────────────────────────────────────
// 内部ヘルパー
// ──────────────────────────────────────────

/**
 * maskInlineCode はインラインコード (バッククォート囲み) 内のテキストを
 * 空白文字列に置換した文字列を返す。
 *
 * 列番号が必要な場合は元の文字列を使用し、検出判定のみ masked を使う。
 */
function maskInlineCode(line: string): string {
  // `...` を同じ長さのスペースに置換する
  return line.replace(/`[^`]*`/g, (match) => " ".repeat(match.length))
}

/**
 * checkNoSpaceInEmphasis はブラケット強調記法のスペース欠落を検出する。
 *
 * 検出対象:
 *   [*xxx] [**xxx] [***xxx] [****xxx] — 太字スペース欠落
 *   [-xxx]                            — 打ち消しスペース欠落
 *   [/xxx] (クロスプロジェクトリンク [/proj/page] は除外)
 */
function checkNoSpaceInEmphasis(masked: string, lineNo: number, findings: NotationFinding[]): void {
  // [*+非スペース文字] — 太字 (* の数は問わない)
  for (const m of masked.matchAll(/\[(\*{1,4})([^\s\]$/*])/g)) {
    const stars = m[1] ?? "*"
    findings.push({
      line: lineNo,
      column: m.index + 1,
      rule: "no-space-in-emphasis",
      severity: "warning",
      message: `[${stars}テキスト] の ${stars} 直後にスペースがありません。リンク記法として解釈されます`,
      hint: `[${stars} テキスト] のように * の直後に半角スペースを入れてください`,
    })
  }

  // [-非スペース文字] — 打ち消し
  for (const m of masked.matchAll(/\[-([^\s\]])/g)) {
    findings.push({
      line: lineNo,
      column: m.index + 1,
      rule: "no-space-in-emphasis",
      severity: "warning",
      message: "[- テキスト] の - 直後にスペースがありません。リンク記法として解釈されます",
      hint: "[- テキスト] のように - の直後に半角スペースを入れてください",
    })
  }

  // [/非スペース文字] — 斜体 (クロスプロジェクトリンク [/proj/page] は除外)
  // クロスプロジェクトリンクは内容に "/" が含まれる
  for (const m of masked.matchAll(/\[\/([^\s/\]][^\]]*)\]/g)) {
    const content = m[1] ?? ""
    // "/" が含まれる場合はクロスプロジェクトリンクとみなして除外
    if (content.includes("/")) continue
    findings.push({
      line: lineNo,
      column: m.index + 1,
      rule: "no-space-in-emphasis",
      severity: "warning",
      message: "[/ テキスト] の / 直後にスペースがありません。リンク記法として解釈されます",
      hint: "[/ テキスト] のように / の直後に半角スペースを入れてください",
    })
  }
}

/**
 * checkReversedHeadingHierarchy はドキュメント全体を走査し、
 * [* x] (最小サイズ) が [** y] 以上のサイズより先に出現する
 * Markdown 的な逆転を検出する。
 *
 * 「行全体が [*+ text] のみ」の行をヘッダ行として扱う。
 */
function checkReversedHeadingHierarchy(lines: string[], findings: NotationFinding[]): void {
  // ヘッダ行の * の数と行番号を収集する
  const headings: Array<{ starCount: number; lineNo: number }> = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]?.trim() ?? ""
    // code: / table: ブロック内は除外
    if (/^(?:code|table):/.test(raw)) {
      // ブロック終わりまでスキップ (ここでは簡易的に次のインデントなし行まで)
      while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1] ?? "")) {
        i++
      }
      continue
    }
    // 行全体が [*+ text] の場合のみヘッダ行と判定する
    const m = raw.match(/^\[(\*{1,4})\s+[^\]]+\]$/)
    if (m) {
      headings.push({ starCount: (m[1] ?? "").length, lineNo: i + 1 })
    }
  }

  if (headings.length < 2) return

  // 最小 * 数の初回出現位置を把握する
  const minStars = Math.min(...headings.map((h) => h.starCount))
  const maxStars = Math.max(...headings.map((h) => h.starCount))

  // minStars === maxStars の場合はすべて同じサイズなので逆転なし
  if (minStars === maxStars) return

  // minStars の最初の出現より後に maxStars の出現があれば Markdown 的な逆転
  const firstMin = headings.find((h) => h.starCount === minStars)
  const firstMax = headings.find((h) => h.starCount === maxStars)

  if (firstMin && firstMax && firstMin.lineNo < firstMax.lineNo) {
    findings.push({
      line: firstMin.lineNo,
      rule: "reversed-heading-hierarchy",
      severity: "warning",
      message: `[${"*".repeat(minStars)} テキスト] (最小サイズ) が [${"*".repeat(maxStars)} テキスト] (より大きいサイズ) より前に出現しています。Markdown の見出しレベルと逆転しています`,
      hint: "Cosense では * の数が多いほど大きく表示されます。トップレベルの見出しには [*** テキスト] または [**** テキスト] を使ってください",
    })
  }
}

/**
 * checkMarkdownBoldResidue は Markdown の太字記法 (**bold** / __bold__) の残留を検出する。
 */
function checkMarkdownBoldResidue(
  masked: string,
  lineNo: number,
  findings: NotationFinding[],
): void {
  // **text** (*** はリスト前の空行等の誤検知を防ぐため最低1文字以上の非アスタリスク)
  for (const m of masked.matchAll(/\*\*([^*\s][^*]*[^*\s]|\S)\*\*/g)) {
    findings.push({
      line: lineNo,
      column: m.index + 1,
      rule: "markdown-bold-residue",
      severity: "warning",
      message: "Markdown の太字記法 **テキスト** が残っています",
      hint: "Cosense の太字記法 [* テキスト] に置き換えてください",
    })
  }

  // __text__
  for (const m of masked.matchAll(/__([^_\s][^_]*[^_\s]|\S)__/g)) {
    findings.push({
      line: lineNo,
      column: m.index + 1,
      rule: "markdown-bold-residue",
      severity: "warning",
      message: "Markdown の太字記法 __テキスト__ が残っています",
      hint: "Cosense の太字記法 [* テキスト] に置き換えてください",
    })
  }
}

/**
 * checkMarkdownItalicResidue は Markdown の斜体記法 (*italic* / _italic_) の残留を検出する。
 *
 * [* text] 内の * を誤検知しないよう、[ の直後の * は除外する。
 * **bold** の * も除外する (3文字以上連続する * は対象外)。
 * URL 内の _ は除外する。
 */
function checkMarkdownItalicResidue(
  masked: string,
  lineNo: number,
  findings: NotationFinding[],
): void {
  // *text* — ただし:
  //   ** は除外 (bold-residue 側で検出)
  //   [* のパターンは除外 (Cosense 太字記法)
  //   先頭の * が [ に続く場合は除外
  for (const m of masked.matchAll(/(?<!\[)(?<!\*)\*(?!\*)([^*\s][^*]*[^*\s]|\S)\*(?!\*)/g)) {
    findings.push({
      line: lineNo,
      column: m.index + 1,
      rule: "markdown-italic-residue",
      severity: "warning",
      message: "Markdown の斜体記法 *テキスト* が残っています",
      hint: "Cosense の斜体記法 [/ テキスト] に置き換えてください",
    })
  }

  // _text_ — URL 内の _ を除外するため、前後にスペースまたは行端が来る場合のみ検出
  // ただし完全な URL パターン (https?:// や word/word 等) は除外が難しいため
  // 単語の境界 (\b) を利用する
  for (const m of masked.matchAll(/(?<![/\w])_([^_\s][^_]*[^_\s]|\S)_(?![/\w])/g)) {
    findings.push({
      line: lineNo,
      column: m.index + 1,
      rule: "markdown-italic-residue",
      severity: "warning",
      message: "Markdown の斜体記法 _テキスト_ が残っています",
      hint: "Cosense の斜体記法 [/ テキスト] に置き換えてください",
    })
  }
}
