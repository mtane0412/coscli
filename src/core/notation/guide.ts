/**
 * guide.ts — Cosense 記法ガイドコンテンツ定義。
 *
 * NOTATION_GUIDE はエージェント向けの構造化された記法リファレンス。
 * `cos notation` コマンドで JSON / テーブル / TSV 形式で出力できる。
 *
 * 参考: https://gist.github.com/taiseiue/493e17ed6d95a9fc5881d0701692e77e
 * (ユーザー個別ポリシーは含まず coscli 仕様に最適化)
 */

/** NotationItem は1つの記法の説明。 */
export interface NotationItem {
  /** 記法の書き方例 */
  syntax: string
  /** 表示結果や用途 */
  description: string
  /** 注意事項や補足 (省略可) */
  note?: string
}

/** NotationSection は記法カテゴリのグループ。 */
export interface NotationSection {
  /** カテゴリ名 */
  title: string
  /** カテゴリの説明 (省略可) */
  description?: string
  /** 記法一覧 */
  items: NotationItem[]
}

/** NotationGuide はガイド全体の構造。 */
export interface NotationGuide {
  sections: NotationSection[]
  /** エージェントが特に誤りやすいポイントの注意事項 */
  tips: string[]
}

/** NOTATION_GUIDE は Cosense 記法のリファレンスデータ。 */
export const NOTATION_GUIDE: NotationGuide = {
  sections: [
    {
      title: "基本原則",
      items: [
        {
          syntax: "[テキスト]",
          description: "ブラケットで囲むとページリンクになる。これだけ覚えれば十分",
        },
        {
          syntax: "1行目",
          description: "ページの1行目がタイトルになる",
        },
        {
          syntax: " (スペース/Tab)",
          description: "行頭にスペースまたはTabで箇条書き（インデントで階層化）",
        },
      ],
    },
    {
      title: "リンク",
      items: [
        {
          syntax: "[ページタイトル]",
          description: "同プロジェクト内のページへのリンク",
        },
        {
          syntax: "https://example.com",
          description: "URLをそのまま書くとリンクになる",
        },
        {
          syntax: "[https://example.com タイトル]",
          description: "URL + タイトルのリンク ([タイトル URL] の順でもOK)",
        },
        {
          syntax: "[/プロジェクト名/ページ名]",
          description: "別プロジェクトへのクロスプロジェクトリンク",
        },
        {
          syntax: "#タグ名",
          description: "[リンク] と機能的に同じ。ページのタグ付けに使う",
          note: "日本語での多用は避ける（関連しすぎる問題）",
        },
      ],
    },
    {
      title: "文字装飾",
      description: "* の数が多いほど大きく表示される（Markdownとは逆）。スペースは必須",
      items: [
        {
          syntax: "[* テキスト]",
          description: "太字・最小サイズ（Markdownの**bold**に近い）",
          note: "* の直後に半角スペースが必要。[*テキスト] はリンク記法になる",
        },
        {
          syntax: "[** テキスト]",
          description: "太字・中サイズ",
          note: "* の直後に半角スペースが必要",
        },
        {
          syntax: "[*** テキスト]",
          description: "太字・大サイズ（見出しの代用に適する）",
          note: "* の直後に半角スペースが必要",
        },
        {
          syntax: "[**** テキスト]",
          description: "太字・最大サイズ（トップレベル見出しに適する）",
          note: "* の直後に半角スペースが必要",
        },
        {
          syntax: "[[テキスト]]",
          description: "太字（最小サイズ、[* テキスト] と同等）",
        },
        {
          syntax: "[/ テキスト]",
          description: "斜体（イタリック）",
          note: "/ の直後に半角スペースが必要",
        },
        {
          syntax: "[/* テキスト]",
          description: "太字斜体",
        },
        {
          syntax: "[- テキスト]",
          description: "打ち消し線",
          note: "- の直後に半角スペースが必要",
        },
      ],
    },
    {
      title: "コードブロック",
      items: [
        {
          syntax: "`コード`",
          description: "インラインコード",
        },
        {
          syntax: "code:ファイル名.js\n (インデント)コード本文",
          description: "コードブロック。code: の後にファイル名（拡張子で言語ハイライト）",
          note: "ブロック内はスペース/Tabでインデントする",
        },
      ],
    },
    {
      title: "テーブル・引用",
      items: [
        {
          syntax: "table:テーブル名\n (インデント)見出しA\t見出しB",
          description: "テーブル。セルはTab区切り、ブロック内はインデント",
        },
        {
          syntax: "> テキスト",
          description: "引用",
        },
      ],
    },
    {
      title: "画像・アイコン",
      items: [
        {
          syntax: "[https://example.com/image.png]",
          description: "画像の埋め込み（URLが画像の場合は自動的に表示）",
        },
        {
          syntax: "[[https://example.com/image.png]]",
          description: "横幅いっぱいの大きな画像",
        },
        {
          syntax: "[ページ名.icon]",
          description: "アイコン記法（ページのサムネイル画像を小さく表示）",
        },
        {
          syntax: "[ユーザー名.icon*3]",
          description: "アイコンを3個並べて表示",
        },
      ],
    },
    {
      title: "数式・コマンドライン",
      items: [
        {
          syntax: "[$ \\frac{a}{b}]",
          description: "LaTeX 数式",
        },
        {
          syntax: "$ git status",
          description: "コマンドライン表示（行頭に $ または %）",
        },
      ],
    },
  ],
  tips: [
    "【重要】* の数が多いほど大きく表示されます（Markdownとは逆）。トップレベルの見出しには [*** テキスト] または [**** テキスト] を使ってください",
    "【重要】[* テキスト] の * / / / - の直後には必ず半角スペースが必要です。スペースなしの [*テキスト] はページリンク記法として解釈されます",
    "Cosenseに独立した「見出し記法」はありません。[*** テキスト] のような太字サイズで見出しを表現します",
    "1行目がページタイトルになります。タイトルのみの行は通常最初の1行だけにしてください",
    "長いページを作らないのがCosenseのベストプラクティスです。独立した内容は別ページに切り出してリンクでつなぎましょう",
  ],
}
