---
name: coscli
description: Cosense (旧 Scrapbox) のページ取得・編集・検索を行う coscli (cos コマンド) を使うスキル。ユーザーが Scrapbox/Cosense のページや特定プロジェクトについて言及した場合、ページの読み取り・作成・編集・検索を求めた場合に自動的に使用する。
---

# coscli (cos) スキル

`cos` は Cosense (旧 Scrapbox) 向け AI エージェント親和的 CLI。

インストール確認: `command -v cos` — 未インストールの場合: `brew install coscli`

---

## 認証確認 (すべての操作の前に)

```bash
cos auth whoami --json
```

exit 2 (未認証) の場合:

```bash
cos auth login                          # 対話ログイン
cos auth login --browser                # ブラウザ自動取得
COS_SID="..." cos page list --project myproject  # 環境変数で都度渡す
```

---

## 動的スキーマ取得 (コマンド・フラグが不確かなら必ずこれで確認)

```bash
cos schema --json                   # 全コマンドツリー
cos schema page list --json         # 特定コマンドのスキーマ
cos exit-codes --json               # 終了コード一覧 (単一ソース)
```

---

## 出力フォーマット

| フラグ | 効果 |
|---|---|
| なし (デフォルト) | 罫線なしのスペースパディング整列テキスト — 人間にも AI エージェントにも読みやすい |
| `--json` / `-J` | envelope JSON 出力 (`{ "data": ..., "meta": ... }`) |
| `--results-only` | `data` フィールドのみ出力 |
| `--select '<path>'` | `data` 内フィールドを抽出 (例: `pages[].title`, `commitId`) |
| `--plain` / `-P` | タブ区切り TSV 出力 — `awk` / `cut` 等のスクリプト連携向け |

**鉄則**: Claude Code から呼ぶときは `--json --results-only --select '<path>'` で最小データだけ受け取る。

---

## 読み取り

```bash
# ページ一覧 (タイトルだけ)
cos page list --project <name> --json --results-only --select 'pages[].title' --limit 50 --sort updated
# sort: updated|created|accessed|pageRank|links|views|title

# ページ全データ (JSON)
cos page get "タイトル" --project <name> --json --results-only
# data: { id, title, lines: [{ text, ... }], commitId, persistent, ... }

# AI 向け Markdown (メタデータ・テロメア・本文・1-hop 関連ページをワンショット出力)
cos page get "タイトル" --project <name> --format ai

# 本文テキスト
cos page text "タイトル" --project <name>
cos page text "タイトル" --project <name> --format=md   # Markdown 変換

# 本文 + リンク先文脈 (AI 文脈注入に最適)
# data.text に "<Page title="A">本文...</Page><Page title="B">本文...</Page>" XML 形式のテキストが入る
cos page context "タイトル" --project <name> --json --results-only
cos page context "タイトル" --project <name> --hops 2                    # 2hop まで広げる (取得量大)
cos page context "タイトル" --project <name> --query "キーワード"          # 本文フィルタ (トークン節約)

# コードブロック / テーブル
cos page code "タイトル" "filename.ts" --project <name>
cos page table "タイトル" "filename" --project <name>   # CSV テキスト

# スナップショット
cos page snapshot list "タイトル" --project <name> --json --results-only  # alias: ls
cos page snapshot get "タイトル" <timestampId> --project <name> --json --results-only

# コミット履歴
cos page history "タイトル" --project <name> -n 10 --json --results-only
cos page history --page-id <pageId> --project <name> --json --results-only  # リネーム後も追跡可能
cos page history "タイトル" --project <name> --since <commitId> --json --results-only  # 差分のみ取得

# 行・範囲取得
cos page line get "タイトル" --line 3 --project <name> --json --results-only
cos page line get "タイトル" --range 3:7 --project <name> --json --results-only

# URL / アイコン
cos page url "タイトル" --project <name> --json --results-only
cos page icon "タイトル" --project <name> --json --results-only

# 検索
cos search "キーワード" --project <name> --json --results-only --select 'pages[].title'

# プロジェクト情報・フィード・横断検索
cos project list --json --results-only
cos project info --project <name> --json --results-only
cos project members --project <name> --json --results-only
cos project stream --project <name> --limit 20 --json --results-only
cos project search "キーワード" --json --results-only
```

---

## 書き込み — 第一選択は行編集 (page line)

**⚠️ CRITICAL: 書き込みコンテンツは必ず `/cosense-notation` スキルで Cosense 記法を確認してから作成すること。Markdown（`## 見出し`、`- リスト`、`| テーブル |`）で書かないこと。**

記法をトピック別に確認する場合は `cos notation <topic>` を使う (例: `cos notation table` でテーブル記法のみ取得)。利用可能なトピック: `basics` / `link` / `decoration` / `table` / `code-block` / `mermaid` / `image` / `icon` など。`cos notation` で全トピック一覧を表示。

**⚠️ 編集系コマンドはすべて PAT 必須の 2 ステップ方式 (preview → submit) です。`cos page edit submit <previewId>` で確定します。**

| 用途 | 推奨コマンド |
|---|---|
| 末尾に追記 | `cos page append preview "タイトル" --line ...` |
| 冒頭 (タイトル直後) に追記 | `cos page prepend preview "タイトル" --line ...` |
| 特定行の直後に挿入 | `cos page insert preview "タイトル" --after N --line ...` |
| lineId で直接挿入位置指定 | `cos page insert preview "タイトル" --after-id <id> --line ...` |
| 指定行を置換 (単一行・改行禁止) | `cos page line replace preview "タイトル" --line N --text ...` |
| 指定行または範囲を削除 | `cos page line delete preview "タイトル" --line N` / `--range a:b` |
| 新規ページを作る | `cos page new preview "タイトル" --line ...` |
| ops JSON で細かく制御 | `cos page edit preview "タイトル" --ops '{"ops":[...]}'` |

```bash
# 末尾追記
cos page append preview "タイトル" --line "追加行" -p <name>
cos page edit submit "<previewId>" -p <name>

# 先頭挿入
cos page prepend preview "タイトル" --line "冒頭に追加" -p <name>
cos page edit submit "<previewId>" -p <name>

# 指定行の後ろに挿入 (--after: 1-indexed 行番号、--after-id: lineId 直接指定)
cos page insert preview "タイトル" --after 3 --line "挿入テキスト" -p <name>
cos page insert preview "タイトル" --after-id "<lineId>" --line "挿入テキスト" -p <name>
cos page edit submit "<previewId>" -p <name>

# 行置換 (単一行・改行禁止)
cos page line replace preview "タイトル" --line 3 --text "新しい内容" -p <name>
cos page edit submit "<previewId>" -p <name>

# 行削除 (単一行 / 範囲)
cos page line delete preview "タイトル" --line 3 -p <name>
cos page line delete preview "タイトル" --range 3:5 -p <name>
cos page edit submit "<previewId>" -p <name>

# 新規ページ
cos page new preview "タイトル" --line "本文\n2行目" -p <name>
cos page edit submit "<previewId>" -p <name>

# ops JSON で細かく制御 (行 ID 指定)
cos page get "タイトル" --json -p <name> | jq '.data.lines[] | {id, text}'
cos page edit preview "タイトル" -p <name> \
    --ops '{"ops":[{"insertBefore":"<lineId>","text":"挿入テキスト"},{"delete":"<lineId>"}]}'
cos page edit submit "<previewId>" -p <name>

# ページ削除 (エージェント環境では --force --no-input が必須)
cos page delete "タイトル" --force --no-input --project <name>

# ピン留め / 解除 / リネーム (SID 必須)
cos page pin "タイトル" --project <name>
cos page unpin "タイトル" --project <name>
cos page rename "旧タイトル" "新タイトル" --project <name>
```

**行置換の制約**: `page line replace preview` は単一行・単一テキスト（改行禁止）のみ対応。複数行の複雑な置換には `cos page edit preview --ops` を使う。
**範囲指定**: `--line` と `--range` は排他。`--range a:b` は `a >= 1`, `a <= b` 必須。タイトル行 (1行目) は変更不可。exit 5 で失敗する。

---

## AI エージェント向け安全運用

### Sandbox による権限制限

```bash
# 読み取り専用に制限
cos --enable-commands "page.list,page.get,page.text,page.code,page.url,page.icon,\
page.history,page.table,page.snapshot.list,page.snapshot.get,page.line.get,\
page.context,page.watch,project.list,project.info,project.members,project.graph,\
project.stream,project.search,search,auth.whoami,schema,exit-codes" \
    page list --project <name> --json

# 特定コマンドだけ禁止
cos --disable-commands "page.delete" page list --project <name>

# 環境変数でも設定可能
COS_ENABLE_COMMANDS="page.list,page.get,search" cos page list --project <name>
```

違反時: exit 7 / stderr に `[denied] <command> is disabled by policy`

### Sandbox 識別子 — 読み取り系

| 識別子 | コマンド |
|---|---|
| `page.list` / `page.get` / `page.text` | ページ読み取り |
| `page.code` / `page.url` / `page.icon` | 読み取り補助 |
| `page.history` / `page.table` | 履歴・テーブル取得 |
| `page.snapshot.list` / `page.snapshot.get` | スナップショット取得 |
| `page.line.get` | 行・範囲取得 |
| `page.context` | Smart Context (リンク先本文取得、読み取り) |
| `page.watch` | リアルタイム監視 (読み取りのみ) |
| `project.list` / `project.info` / `project.members` / `project.graph` | プロジェクト情報 |
| `project.stream` / `project.search` | フィード・横断検索 (読み取り) |
| `search` | プロジェクト内ページ検索 |
| `auth.whoami` / `auth.list` | 認証状態確認 |
| `config.get` / `config.path` | 設定確認 |
| `schema` / `exit-codes` | メタ情報 |

### Sandbox 識別子 — 書き込み系 (PAT 必須、preview/submit の 2 ステップ)

| 識別子 | コマンド |
|---|---|
| `page.line.replace.preview` / `page.line.delete.preview` | 行・範囲編集 (PAT 必須) |
| `page.new.preview` / `page.edit.preview` / `page.edit.submit` / `page.append.preview` | ページ書き込み (PAT 必須) |
| `page.prepend.preview` / `page.insert.preview` / `page.rename` | ページ書き込み |
| `page.pin` / `page.unpin` | ピン留め (SID 必須) |
| `page.delete` | 削除 (破壊的、SID 必須) |
| `page.watch` を除く `auth.*` | 認証変更 |
| `config.set` | 設定変更 |
| `sync.pull` / `sync.push` / `sync.diff` | 同期 |
| `convert` | 変換 |
| `serve.rest` | REST サーバー |

### 設定ファイルによる永続制限

`~/.config/coscli/config.json5` (パス確認: `cos config path`):

```json5
{
  agent: {
    defaultDisableCommands: ["page.delete", "auth.logout"]
  }
}
```

---

## 終了コードと対処

| コード | 意味 | 対処 |
|---|---|---|
| 0 | 成功 | — |
| 1 | 一般エラー | stderr を確認 |
| 2 | 認証エラー (401) / PAT 必須コマンドを非 PAT 認証で実行 | `cos auth login` または PAT を設定 |
| 3 | 権限エラー (403) | プロジェクトへのアクセス権を確認 |
| 4 | 存在しない (404) | タイトル / プロジェクト名を確認。`cos page new preview` で作成 |
| 5 | バリデーションエラー | 引数・フラグを確認。重複タイトル: `--force-fallback` を追加 |
| 6 | 楽観ロック競合 | 最新 commitId を再取得して `--expect-commit` を更新し再実行、または `page line` 系に切り替え |
| 7 | sandbox 違反 | `--enable-commands` を緩和 |
| 124 | タイムアウト | `--timeout` を延長 |

**exit 6 の回復パターン**:

```bash
# page edit preview は内部で最新ページを取得するため、競合時はそのまま再実行する
cos page edit preview "タイトル" -p <name> --ops '{"ops":[...]}'
cos page edit submit "<newPreviewId>" -p <name>

# または: 変更範囲が局所的なら page line に切り替えて競合リスクを下げる
# (行番号は先に cos page line get で確認する)
cos page line replace "タイトル" --range 3:5 --from-file ./patch.txt --project <name>
```

**対話プロンプトで止まる (CONFIRMATION_REQUIRED)**: `--no-input` を付ける。`page delete` 等は `--force` も追加。

---

## 補助機能 (convert / sync / serve)

```bash
# テキスト変換 (Scrapbox ⇔ Markdown)
cos convert --from=scrapbox --to=md --from-file input.txt
cos convert --from=md --to=scrapbox --from-file input.md --to-file output.txt

# ローカル同期
cos sync diff "タイトル" --dir ./sync --project <name>   # まず確認
cos sync pull "タイトル" --dir ./sync --project <name>
cos sync push "タイトル" --dir ./sync --project <name>   # 競合(exit 6): pull してからマージ

# ローカル REST プロキシ
cos serve --rest --port=8080 --project <name>
cos serve --rest --port=8080 --allow-write --project <name>
```

---

## 共通フラグ早見表

| フラグ | 省略 | 内容 |
|---|---|---|
| `--project <name>` | `-p` | 対象プロジェクト (env: `COS_PROJECT`) |
| `--profile <name>` | — | 認証プロファイル (デフォルト `default`) |
| `--json` | `-J` | JSON envelope 出力 |
| `--plain` | `-P` | タブ区切り TSV 出力 (スクリプト向け) |
| `--results-only` | — | `data` フィールドのみ出力 |
| `--select <path>` | — | `data` 内フィールドを抽出 |
| `--dry-run` | — | 書き込みをシミュレート |
| `--no-input` | — | 対話入力を無効化 (CI/エージェント必須) |
| `--verbose` | `-v` | 詳細ログ |
| `--quiet` | `-q` | 成功時の人間向けメッセージを抑制 |
| `--enable-commands <list>` | — | 許可コマンドを限定 |
| `--disable-commands <list>` | — | 特定コマンドを禁止 |

---

## 参考

- リポジトリ: https://github.com/mtane0412/coscli
- 設定ファイル: `cos config path` で確認
- 動的スキーマ: `cos schema --json` (最も信頼できる最新情報)
- 終了コード: `cos exit-codes --json` (単一ソース)
- 全コマンドヘルプ: `cos --help` / `cos page --help` / `cos <noun> <verb> --help`
