/**
 * guide.ts — Cosense 記法ガイドコンテンツ定義。
 *
 * NOTATION_GUIDE はエージェント向けの構造化された記法リファレンス。
 * `cos notation` コマンドで JSON / テーブル / TSV 形式で出力できる。
 * `cos notation <id>` でトピック単位に絞り込み可能。
 *
 * 参考:
 *   https://scrapbox.io/help-jp/ブラケティング
 *   https://scrapbox.io/help-jp/文字装飾記法
 *   https://scrapbox.io/help-jp/その他の書き方
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
  /** トピック ID (`cos notation <id>` で取得) */
  id: string
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
}

/** NOTATION_GUIDE は Cosense 記法のリファレンスデータ。 */
export const NOTATION_GUIDE: NotationGuide = {
  sections: [
    {
      id: "basics",
      title: "基本原則",
      description: "ブラケティングとページ構造の基本",
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
          syntax: "[https://example.com/image.png]",
          description: "1行目に画像URLを置くとページタイトル画像になる",
          note: "ページリスト・関連ページリスト・アイコン記法で表示される",
        },
      ],
    },
    {
      id: "list",
      title: "箇条書き",
      description: "行頭スペース/Tab によるインデントで階層化",
      items: [
        {
          syntax: " (スペース/Tab)",
          description: "行頭にスペースまたはTabで箇条書き（インデントで階層化）",
        },
        {
          syntax: "親行\n 子行1\n 子行2",
          description: "インデントなし行が「セクション」に相当し、インデント1段で内容を表現",
        },
      ],
    },
    {
      id: "link",
      title: "リンク",
      description: "ページ内/外部/別プロジェクトへのリンク",
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
          description: "URL + タイトルのリンク ([タイトル URL] の逆順でもOK)",
        },
        {
          syntax: "[リンク先URL 画像URL]",
          description: "リンク付き画像 ([画像URL リンク先URL] の逆順でもOK)",
        },
        {
          syntax: "[/プロジェクト名/ページ名]",
          description: "別プロジェクトへのクロスプロジェクトリンク",
        },
      ],
    },
    {
      id: "hashtag",
      title: "ハッシュタグ",
      description: "[リンク] と機能的に同じ。ページのタグ付けに使う",
      items: [
        {
          syntax: "#タグ名",
          description: "[リンク] と機能的に同じ。ページのタグ付けに使う",
          note: "日本語での多用は避ける（関連しすぎる問題）",
        },
      ],
    },
    {
      id: "image",
      title: "画像",
      description: "画像・動画の埋め込み",
      items: [
        {
          syntax: "[https://example.com/image.png]",
          description: "画像の埋め込み（URLが画像の場合は自動的に表示）",
        },
        {
          syntax: "[[https://example.com/image.png]]",
          description: "横幅いっぱいの大きな画像（高さ制限なし）",
        },
        {
          syntax: "[リンク先URL 画像URL]",
          description: "リンク付き画像。[画像URL リンク先URL] の逆順でもOK",
        },
        {
          syntax: "[動画URL]",
          description: "動画（YouTube等）も同様の記法で埋め込み可能",
        },
      ],
    },
    {
      id: "icon",
      title: "アイコン",
      description: "ページタイトル画像を文字と同じサイズで埋め込む",
      items: [
        {
          syntax: "[ページ名.icon]",
          description: "アイコン記法（ページのサムネイル画像を小さく表示）",
        },
        {
          syntax: "[ユーザー名.icon*3]",
          description: "アイコンを3個並べて表示",
        },
        {
          syntax: "[/プロジェクト名/ページ名.icon]",
          description: "別プロジェクトのアイコン",
        },
      ],
    },
    {
      id: "decoration",
      title: "文字装飾",
      description:
        "強調・斜体・打消し線。* の数が多いほど大きく (Markdownと逆)。記号はミックス可能",
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
          description: "太字・大サイズ",
          note: "* の直後に半角スペースが必要",
        },
        {
          syntax: "[**** テキスト]",
          description: "太字・最大サイズ",
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
        {
          syntax: "[-/*** テキスト]",
          description: "ミックス記法: 打ち消し線 + 斜体 + 大きな文字を組み合わせ",
          note: "* / / / - を1つのブラケット内で組み合わせ可能 (公式: [-/*** 打ち消し斜体大きな文字])",
        },
        {
          syntax: "[! テキスト] / [{ テキスト] など任意記号",
          description:
            "*, /, - 以外の記号 !\"#%&'()+{|}<>_~ も使え、deco-! / deco-{ などの CSS class が出力される",
          note: "Cosense 標準では見た目は変わらず、UserCSS 等で装飾を定義する",
        },
      ],
    },
    {
      id: "inline-code",
      title: "インラインコード",
      description: "バッククオートで囲む",
      items: [
        {
          syntax: "`コード`",
          description: "インラインコード",
        },
      ],
    },
    {
      id: "code-block",
      title: "コードブロック",
      description: "code: 記法でコードをブロック表示し、拡張子で言語ハイライト",
      items: [
        {
          syntax: "code:ファイル名.js\n (インデント)コード本文",
          description: "コードブロック。code: の後にファイル名（拡張子で言語ハイライト）",
          note: "ブロック内はスペース/Tabでインデントする。coscli はコードブロック内の空行を自動補正する",
        },
      ],
    },
    {
      id: "mermaid",
      title: "Mermaid 図",
      description: "code:mermaid または code:mmd でフローチャート・シーケンス図等を描画",
      items: [
        {
          syntax: "code:mermaid\n flowchart LR\n  A-->B",
          description: "Mermaid 図。code:mermaid / code:mmd / code:ファイル名.mmd で書く",
        },
        {
          syntax: "code:sequence.mmd\n sequenceDiagram\n  A->>B: メッセージ",
          description: "シーケンス図",
        },
        {
          syntax: "code:gantt.mmd\n gantt\n  title タスク",
          description: "ガントチャート",
        },
      ],
    },
    {
      id: "table",
      title: "テーブル",
      description: "table: 記法でスプレッドシート風の表を作成",
      items: [
        {
          syntax: "table:テーブル名\n\t見出しA\t見出しB\n\tデータ1\tデータ2",
          description: "テーブル。セルはTab区切り、ブロック内はインデント",
          note: "ヘッダ行と通常行の書式は同じ（Cosense はヘッダを特別扱いしない）。テーブル名はスペースを含めることも可能",
        },
      ],
    },
    {
      id: "quote",
      title: "引用",
      description: "行頭 > で引用ブロックを作成",
      items: [
        {
          syntax: "> テキスト",
          description: "引用",
        },
      ],
    },
    {
      id: "math",
      title: "数式",
      description: "[$ ...] で LaTeX 数式を埋め込む",
      items: [
        {
          syntax: "[$ \\frac{a}{b}]",
          description: "LaTeX 数式",
        },
        {
          syntax: "[$ x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}]",
          description: "二次方程式の解の公式の例",
        },
      ],
    },
    {
      id: "cli",
      title: "コマンドライン",
      description: "行頭 $ または % でコマンドライン表示",
      items: [
        {
          syntax: "$ git status",
          description: "コマンドライン表示（行頭に $ または %）",
        },
        {
          syntax: "% cp a.txt b.txt",
          description: "% でも同様にコマンドライン表示",
        },
      ],
    },
    {
      id: "helpfeel",
      title: "Helpfeel 記法",
      description: "行頭 ? で Helpfeel FAQ ハイライト",
      items: [
        {
          syntax: "? 使い方を教えてください",
          description: "行頭に ? と半角スペースで Helpfeel 記法。FAQ ページでハイライト表示される",
          note: "Cosense のみ利用の場合も表示されるが Helpfeel の機能は使えない",
        },
      ],
    },
    {
      id: "location",
      title: "Location (地図)",
      description: "N緯度,E経度,Zズーム タイトル で地図を埋め込む",
      items: [
        {
          syntax: "[N35.6582536,E139.7443415,Z15 東京タワー]",
          description: "Google Maps 地図の埋め込み。N緯度,E経度,Zズームレベル タイトル",
        },
        {
          syntax: "https://www.google.com/maps/place/...",
          description: "Google Maps の URL をそのまま貼ると地図として埋め込まれる",
        },
      ],
    },
    {
      id: "tips",
      title: "エージェント向け注意事項",
      description: "Claude 等のエージェントが特に誤りやすいポイント",
      items: [
        {
          syntax: "[*** テキスト] または [**** テキスト]",
          description:
            "【重要】* の数が多いほど大きく表示される (Markdownとは逆)。[* テキスト] が最小、[**** テキスト] が最大サイズ",
        },
        {
          syntax: "[* テキスト] ← スペース必須",
          description:
            "【重要】[* テキスト] の */ // -の直後には必ず半角スペースが必要。スペースなしの [*テキスト] はページリンクになる",
        },
        {
          syntax: "1行目",
          description: "1行目がページタイトルになる。タイトル行は通常1行だけにする",
        },
        {
          syntax: "(ページを分割してリンク)",
          description:
            "長いページを作らないのがベストプラクティス。独立した内容は別ページに切り出してリンクでつなぐ",
        },
        {
          syntax: "#author:claude #waiting-review",
          description:
            "Claudeがコンテンツを作成・編集する際は必須タグを付ける。新規ページは2行目に、追記は末尾行に、全体編集はページ末尾に記述する",
        },
      ],
    },
  ],
}
