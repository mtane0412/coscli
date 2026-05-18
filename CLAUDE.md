# coscli CLAUDE.md

## プロジェクト概要

Cosense (旧 Scrapbox) 向け AI エージェント親和的 CLI。バイナリ名 `cos`。

## 言語・スタイル

- コメント・TSDoc・README・エラーメッセージは**日本語**で記述する
- 変数名・関数名・型名は英語
- エクスポート関数のコメント形式: `/** <関数名> は...を返す。 */`

## 開発規約

### TDD (厳格必須)

**実装コードを書く前に、必ずテストを先に書くこと。実装ファーストは禁止。**

サイクル: RED (失敗するテスト) → GREEN (最小限の実装) → REFACTOR (整理)

### Gitワークフロー

- **main ブランチへの直接コミット禁止**
- ブランチ命名: `feature/<topic>`, `fix/<issue>`, `chore/<topic>`
- PR 必須

### 品質チェック (コミット前に必ず実行)

```bash
bunx biome check src tests   # Lint 警告ゼロ必須
bun run typecheck            # 型エラーゼロ必須
bun test                     # テスト全件 pass 必須
```

### コマンド追加ルール

新コマンドを追加する際は以下を**同一 PR** に含める:
1. `src/commands/<noun>/<verb>.ts` — 実装
2. `tests/unit/commands/<noun>/<verb>.test.ts` — テスト
3. alias がある場合は `src/cli.ts` の両方の登録箇所を更新

### alias ルール

トップレベル alias は citty で別 command として二重登録している。
alias を追加・変更する際は `src/cli.ts` の「エイリアス登録」セクションを必ず同時に更新すること。

## ディレクトリ構造

```
src/
├── cli.ts           # citty エントリポイント。ルートフラグと sandbox の合流点
├── commands/        # noun-verb ごとに 1 ファイル
│   ├── page/
│   ├── project/
│   ├── auth/
│   └── config/
├── core/            # ドメインロジック (CLI から独立)
│   ├── api/
│   │   ├── encoder.ts    # title→slug 変換
│   │   ├── rest.ts       # REST 読み取り + CSRF + リトライ
│   │   └── ws.ts         # ScrapboxWriter interface + @cosense/std ラッパ
│   ├── auth/
│   │   ├── session.ts
│   │   └── store.ts      # TokenStore interface
│   ├── pages.ts
│   ├── projects.ts
│   ├── search.ts
│   └── sandbox.ts        # --enable-commands / --disable-commands
├── infra/
│   ├── keychain/         # OS別 keychain 実装
│   ├── config.ts         # JSON5 設定読み書き
│   ├── logger.ts
│   ├── retry.ts
│   └── color.ts
├── presenter/
│   ├── json.ts           # envelope + --results-only + --select
│   └── plain.ts
└── schemas/              # zod スキーマ
```

## 依存ライブラリ

- **citty** — CLI フレームワーク
- **@cosense/std** (JSR) — Cosense REST + WebSocket commit
- **@cosense/types** (JSR) — Cosense 型定義
- **zod** — スキーマ検証
- **json5** — 設定ファイル
- **picocolors** — 色付け
- **@clack/prompts** — 対話入力 (`--no-input` 時は即エラー)
- **Biome** — Lint + Format

## テスト

- **`bun test`** をメインに使用
- REST モック: `msw/node`
- WS 層テスト: `ScrapboxWriter` のモック実装を注入
- フィクスチャ: `tests/fixtures/` に sanitize 済み実 API レスポンス

## sandbox

`--enable-commands` / `--disable-commands` の仕様:
- 形式: `noun.verb` (例: `page.list`, `page.delete`)
- 両方指定時: enable で絞ってから disable で削る
- 違反時: exit 7 (PolicyDenied)、stderr に `[denied] <command> is disabled by policy`

config 経由の設定:
- `disableCommands`: 全プロジェクト共通の絶対禁止コマンドリスト (CLI フラグで上書き可能)
- `defaultPermission`: 未列挙プロジェクトへの既定権限 (`"read"` / `"readwrite"` / `"none"`、プロジェクト指定時のみ有効)
- `projects.<name>.permission`: プロジェクト固有の権限プリセット
- `projects.<name>.enableCommands` / `disableCommands`: プロジェクト固有の細かい制御

優先順位: CLI フラグ > 環境変数 (`COS_ENABLE_COMMANDS` / `COS_DISABLE_COMMANDS`) > プロジェクト固有設定 > `defaultPermission` > 全許可

`disableCommands` はプロジェクト設定の後に重ねて適用 (CLI/env 指定時は無視)。

プロジェクト名解決: `args.project` > `COS_PROJECT` 環境変数 (config.defaultProject はフォールバックとして使用しない)

コマンド分類: `src/core/command-classification.ts` で read/write を一元管理

## 終了コード

機械可読な一覧は `cos exit-codes --json` で取得できます（単一ソース: `src/core/exit-codes.ts`）。

| code | 意味 |
|---|---|
| 0 | 成功 |
| 1 | 一般エラー |
| 2 | 認証エラー (401) |
| 3 | 権限エラー (403) |
| 4 | NotFound (404) |
| 5 | バリデーションエラー |
| 6 | 楽観ロック競合 |
| 7 | sandbox 違反 |
| 124 | timeout |
