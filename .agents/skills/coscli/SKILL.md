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

## トップレベル alias (よく使う操作)

頻出コマンドはルートに alias が登録されている。`cos page get` と同じ動作。

```bash
cos get "ページ名" --format=ai -p myproj     # cos page get の alias
cos ls -p myproj                              # cos page list の alias
cos edit "ページ名" --op=append --text "行" -p myproj  # cos page edit preview の alias
cos search "キーワード" -p myproj            # cos project search の alias (既存)
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

### `cos page get` — ページ取得の統合コマンド (推奨)

```bash
# ページ全データ (JSON) — デフォルト形式
cos page get "タイトル" --project <name> --json --results-only
# data: { id, title, lines: [{ text, ... }], commitId, persistent, ... }

# --format で出力形式を指定
cos page get "タイトル" --project <name> --format <形式>
```

| `--format` 値 | 出力内容 |
|---|---|
| (なし) | ページ全データ (JSON の場合は構造体、テキストの場合は整列テキスト) |
| `text` | 本文テキスト (コードブロックなし) |
| `md` | 本文を Markdown に変換して出力 |
| `scrapbox` | Cosense 記法のまま出力 |
| `ai` | AI 向け Markdown — メタデータ・テロメア・本文・1-hop 関連ページをワンショット出力 |
| `context` | Smart Context — リンク先本文を XML 形式でまとめて出力 (AI 文脈注入に最適) |
| `code` | コードブロック取得 (要 `--filename <name>`) |
| `table` | テーブルを CSV で取得 (要 `--filename <name>`) |
| `url` | ページの URL を出力 |
| `icon` | ページアイコン取得 URL を出力 |

```bash
# AI エージェント向け Markdown (最も情報量が多い)
cos page get "タイトル" --project <name> --format ai

# テキスト形式
cos page get "タイトル" --project <name> --format text

# Smart Context (1hop リンク先本文を取得)
cos page get "タイトル" --project <name> --format context
cos page get "タイトル" --project <name> --format context --hops 2   # 2hop まで広げる
cos page get "タイトル" --project <name> --format context --query "キーワード"  # フィルタ

# コードブロック / テーブル
cos page get "タイトル" --project <name> --format code --filename src.ts
cos page get "タイトル" --project <name> --format table --filename data

# URL / アイコン
cos page get "タイトル" --project <name> --format url --json --results-only
cos page get "タイトル" --project <name> --format icon --json --results-only
```

### その他の読み取りコマンド

```bash
# ページ一覧 (タイトルだけ)
cos page list --project <name> --json --results-only --select 'pages[].title' --limit 50 --sort updated
# sort: updated|created|accessed|pageRank|links|views|title

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

# 検索
cos search "キーワード" --project <name> --json --results-only --select 'pages[].title'

# プロジェクト情報・フィード・横断検索
cos project list --json --results-only
cos project info --project <name> --json --results-only
cos project members --project <name> --json --results-only
cos project stream --project <name> --limit 20 --json --results-only
cos project search "キーワード" --json --results-only
```

### 非推奨の読み取り verb (まだ使用可能、警告あり)

| 非推奨コマンド | 移行先 |
|---|---|
| `cos page text "タイトル"` | `cos page get "タイトル" --format=text` を使ってください |
| `cos page text "タイトル" --format=md` | `cos page get "タイトル" --format=md` を使ってください |
| `cos page code "タイトル" "file.ts"` | `cos page get "タイトル" --format=code --filename=file.ts` を使ってください |
| `cos page table "タイトル" "data"` | `cos page get "タイトル" --format=table --filename=data` を使ってください |
| `cos page url "タイトル"` | `cos page get "タイトル" --format=url` を使ってください |
| `cos page icon "タイトル"` | `cos page get "タイトル" --format=icon` を使ってください |
| `cos page context "タイトル"` | `cos page get "タイトル" --format=context` を使ってください |

---

## 書き込み — `cos page edit preview --op` (PAT 必須、2 ステップ方式)

**⚠️ CRITICAL: 書き込みコンテンツは必ず `/cosense-notation` スキルで Cosense 記法を確認してから作成すること。Markdown（`## 見出し`、`- リスト`、`| テーブル |`）で書かないこと。**

記法をトピック別に確認する場合は `cos notation <topic>` を使う (例: `cos notation table` でテーブル記法のみ取得)。利用可能なトピック: `basics` / `link` / `decoration` / `table` / `code-block` / `mermaid` / `image` / `icon` など。`cos notation` で全トピック一覧を表示。

**⚠️ 編集系コマンドはすべて PAT 必須の 2 ステップ方式 (preview → submit) です。`cos page edit submit <previewId>` で確定します。**

### `cos page edit preview --op` — 統合書き込みコマンド (推奨)

| `--op` 値 | 用途 |
|---|---|
| `append` | ページ末尾に行を追記 |
| `prepend` | ページ先頭 (タイトル直後) に行を挿入 |
| `insert` | 特定行の直後に挿入 (要 `--after <n>` または `--after-id <id>`) |
| `line-replace` | 指定行を置換 (単一行・改行禁止、要 `--line-number <n>`) |
| `line-delete` | 指定行または範囲を削除 (要 `--line-number <n>` または `--range a:b`) |
| `new-page` | 新規ページを作成 |
| `ops` | ops JSON で細かく制御 (要 `--ops '{"ops":[...]}'`) |

```bash
# 末尾追記
cos page edit preview "タイトル" --op=append --text "追加行" -p <name>
cos page edit submit "<previewId>" -p <name>

# 先頭挿入
cos page edit preview "タイトル" --op=prepend --text "冒頭に追加" -p <name>
cos page edit submit "<previewId>" -p <name>

# 指定行の後ろに挿入 (--after: 1-indexed 行番号、--after-id: lineId 直接指定)
cos page edit preview "タイトル" --op=insert --after 3 --text "挿入テキスト" -p <name>
cos page edit preview "タイトル" --op=insert --after-id "<lineId>" --text "挿入テキスト" -p <name>
cos page edit submit "<previewId>" -p <name>

# 行置換 (単一行・改行禁止)
cos page edit preview "タイトル" --op=line-replace --line-number 3 --text "新しい内容" -p <name>
cos page edit submit "<previewId>" -p <name>

# 行削除 (単一行 / 範囲)
cos page edit preview "タイトル" --op=line-delete --line-number 3 -p <name>
cos page edit preview "タイトル" --op=line-delete --range 3:5 -p <name>
cos page edit submit "<previewId>" -p <name>

# 新規ページ
cos page edit preview "タイトル" --op=new-page --text "本文\n2行目" -p <name>
cos page edit submit "<previewId>" -p <name>

# ops JSON で細かく制御 (行 ID 指定)
cos page get "タイトル" --json -p <name> | jq '.data.lines[] | {id, text}'
cos page edit preview "タイトル" -p <name> \
    --op=ops --ops '{"ops":[{"insertBefore":"<lineId>","text":"挿入テキスト"},{"delete":"<lineId>"}]}'
cos page edit submit "<previewId>" -p <name>
```

**行置換の制約**: `--op=line-replace` は単一行・単一テキスト（改行禁止）のみ対応。複数行の複雑な置換には `--op=ops` を使う。
**範囲指定**: `--range a:b` は `a >= 1`, `a <= b` 必須。タイトル行 (1行目) は変更不可。exit 5 で失敗する。

### 非推奨の書き込み verb (まだ使用可能、警告あり)

| 非推奨コマンド | 移行先 |
|---|---|
| `cos page append preview "タイトル" --line "行"` | `cos page edit preview "タイトル" --op=append --text "行"` を使ってください |
| `cos page prepend preview "タイトル" --line "行"` | `cos page edit preview "タイトル" --op=prepend --text "行"` を使ってください |
| `cos page insert preview "タイトル" --after N --line "行"` | `cos page edit preview "タイトル" --op=insert --after N --text "行"` を使ってください |
| `cos page line replace preview "タイトル" --line N --text "行"` | `cos page edit preview "タイトル" --op=line-replace --line-number N --text "行"` を使ってください |
| `cos page line delete preview "タイトル" --line N` | `cos page edit preview "タイトル" --op=line-delete --line-number N` を使ってください |
| `cos page new preview "タイトル" --line "行"` | `cos page edit preview "タイトル" --op=new-page --text "行"` を使ってください |

---

## SID 必須コマンド

以下のコマンドは PAT では実行できません。`connect.sid` を持つ SID 認証が必要です。

```bash
# ページ削除 (エージェント環境では --force --no-input が必須)
cos page delete "タイトル" --force --no-input --project <name>

# ピン留め / 解除
cos page pin "タイトル" --project <name>
cos page unpin "タイトル" --project <name>

# リネーム (--update-links で被リンクを一括更新)
cos page rename "旧タイトル" "新タイトル" --project <name>

# リンク一括置換
cos page update-links "旧タイトル" "新タイトル" --project <name>

# ローカル同期 push
cos sync push "タイトル" --dir ./sync --project <name>   # 競合(exit 6): pull してからマージ
```

---

## AI エージェント向け安全運用

### Sandbox による権限制限

```bash
# 読み取り専用に制限
cos --enable-commands "page.list,page.get,page.history,page.infobox,\
page.snapshot.list,page.snapshot.get,page.line.get,\
page.watch,project.list,project.info,project.members,project.graph,\
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
| `page.list` / `page.get` | ページ読み取り (get は --format で多形式に対応) |
| `page.history` / `page.infobox` | 履歴・infobox 取得 |
| `page.snapshot.list` / `page.snapshot.get` | スナップショット取得 |
| `page.line.get` | 行・範囲取得 |
| `page.watch` | リアルタイム監視 (読み取りのみ) |
| `project.list` / `project.info` / `project.members` / `project.graph` | プロジェクト情報 |
| `project.stream` / `project.search` | フィード・横断検索 (読み取り) |
| `search` | プロジェクト内ページ検索 |
| `auth.whoami` / `auth.list` | 認証状態確認 |
| `config.get` / `config.path` | 設定確認 |
| `schema` / `exit-codes` | メタ情報 |

### Sandbox 識別子 — 書き込み系 (PAT 必須、2 ステップ: preview → submit)

| 識別子 | コマンド |
|---|---|
| `page.edit.preview` | 統合書き込み (append/prepend/insert/line-replace/line-delete/new-page/ops) |
| `page.edit.submit` | preview を確定コミットに変換 |

### Sandbox 識別子 — SID 必須コマンド

| 識別子 | コマンド |
|---|---|
| `page.rename` | ページリネーム |
| `page.pin` / `page.unpin` | ピン留め |
| `page.update-links` | リンク一括置換 |
| `page.delete` | 削除 (破壊的) |
| `sync.push` | ローカル → Cosense push |

### Sandbox 識別子 — その他

| 識別子 | コマンド |
|---|---|
| `auth.*` (`page.watch` を除く) | 認証変更 |
| `config.set` | 設定変更 |
| `sync.pull` / `sync.diff` | 同期 (読み取り系) |
| `convert` | 変換 |
| `serve.rest` | REST サーバー |

### `--enable-commands-exact` — 最小権限モード

通常の `--enable-commands` は `page` (noun ワイルドカード) や `page.*` (glob) で一括許可できるが、
`--enable-commands-exact` を付けるとワイルドカードが無効になり完全一致のみになる。

```bash
# glob 不使用: page.get と page.list だけを明示許可
cos --enable-commands "page.get,page.list" \
    --enable-commands-exact \
    page get "タイトル" --project myproj --format=ai
```

### `--wrap-untrusted` — プロンプトインジェクション対策

ページ本文などの外部取得テキストを `<external_content>` タグで囲む。
悪意ある Cosense ページが指示を埋め込んでいても、タグ外の信頼コンテキストと分離できる。

```bash
# AI Markdown をラップして取得
cos page get "タイトル" --format=ai --wrap-untrusted --project myproj

# テキスト取得もラップ
cos page get "タイトル" --format=text --wrap-untrusted --project myproj

# JSON 形式でもラップされた文字列が data フィールドに入る
cos page get "タイトル" --format=text --wrap-untrusted --json --project myproj
```

出力例:
```
<external_content source="cosense:myproject/タイトル">
ページ本文...
</external_content>
```

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
| 4 | 存在しない (404) | タイトル / プロジェクト名を確認。`cos page edit preview --op=new-page` で作成 |
| 5 | バリデーションエラー | 引数・フラグを確認。重複タイトル: `--force-fallback` を追加 |
| 6 | 楽観ロック競合 | 最新 commitId を再取得して `--expect-commit` を更新し再実行、または `--op=line-*` 系に切り替え |
| 7 | sandbox 違反 | `--enable-commands` を緩和 |
| 124 | タイムアウト | `--timeout` を延長 |

**exit 6 の回復パターン**:

```bash
# page edit preview は内部で最新ページを取得するため、競合時はそのまま再実行する
cos page edit preview "タイトル" -p <name> --op=ops --ops '{"ops":[...]}'
cos page edit submit "<newPreviewId>" -p <name>

# または: 変更範囲が局所的なら --op=line-replace / --op=line-delete に切り替えて競合リスクを下げる
# (行番号は先に cos page line get で確認する)
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
cos sync push "タイトル" --dir ./sync --project <name>   # 競合(exit 6): pull してからマージ (SID 必須)

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

## 移行ガイド (旧コマンド → 新コマンド)

### 読み取り

| 旧コマンド (v0.10.0 以前) | 新コマンド |
|---|---|
| `cos page text "タイトル"` | `cos page get "タイトル" --format=text` |
| `cos page text "タイトル" --format=md` | `cos page get "タイトル" --format=md` |
| `cos page code "タイトル" "file.ts"` | `cos page get "タイトル" --format=code --filename=file.ts` |
| `cos page table "タイトル" "data"` | `cos page get "タイトル" --format=table --filename=data` |
| `cos page url "タイトル"` | `cos page get "タイトル" --format=url` |
| `cos page icon "タイトル"` | `cos page get "タイトル" --format=icon` |
| `cos page context "タイトル"` | `cos page get "タイトル" --format=context` |
| `cos page context "タイトル" --hops 2` | `cos page get "タイトル" --format=context --hops 2` |
| `cos page context "タイトル" --query "kw"` | `cos page get "タイトル" --format=context --query "kw"` |

### 書き込み

| 旧コマンド (v0.10.0 以前) | 新コマンド |
|---|---|
| `cos page append preview "タイトル" --line "行"` | `cos page edit preview "タイトル" --op=append --text "行"` |
| `cos page prepend preview "タイトル" --line "行"` | `cos page edit preview "タイトル" --op=prepend --text "行"` |
| `cos page insert preview "タイトル" --after N --line "行"` | `cos page edit preview "タイトル" --op=insert --after N --text "行"` |
| `cos page insert preview "タイトル" --after-id "<id>" --line "行"` | `cos page edit preview "タイトル" --op=insert --after-id "<id>" --text "行"` |
| `cos page line replace preview "タイトル" --line N --text "行"` | `cos page edit preview "タイトル" --op=line-replace --line-number N --text "行"` |
| `cos page line delete preview "タイトル" --line N` | `cos page edit preview "タイトル" --op=line-delete --line-number N` |
| `cos page line delete preview "タイトル" --range a:b` | `cos page edit preview "タイトル" --op=line-delete --range a:b` |
| `cos page new preview "タイトル" --line "行"` | `cos page edit preview "タイトル" --op=new-page --text "行"` |
| `cos page edit preview "タイトル" --ops '...'` | `cos page edit preview "タイトル" --op=ops --ops '...'` |

---

## 参考

- リポジトリ: https://github.com/mtane0412/coscli
- 設定ファイル: `cos config path` で確認
- 動的スキーマ: `cos schema --json` (最も信頼できる最新情報)
- 終了コード: `cos exit-codes --json` (単一ソース)
- 全コマンドヘルプ: `cos --help` / `cos page --help` / `cos <noun> <verb> --help`
