# coscli

> [!WARNING]
> **このリポジトリはアーカイブされています。**
>
> 公式 CLI [cosense-cli](https://github.com/helpfeel/cosense-cli) が公開されました。
> 新規インストールには公式 CLI の使用を推奨します。

**Cosense in your terminal.**

[Cosense](https://cosen.se/) (旧 Scrapbox) を端末・スクリプト・AI エージェントから操作するための CLI。バイナリ名 `cos`。

## 特徴

- **JSON 出力対応** (`--json`) — AI エージェントや jq と組み合わせやすい
- **罫線なし整列テキスト出力** (デフォルト) — gogcli 風のスペースパディングで人間にも AI エージェントにも読みやすい。スクリプト連携には `--plain` (TSV) を使用する
- **sandbox 機能** (`--enable-commands` / `--disable-commands`) — AI エージェントに渡す権限を絞れる
- **マルチプロファイル認証** — OS キーチェーンにセッション情報を安全に保存
- **クロスプラットフォーム** — macOS / Linux / Windows 対応
- **Claude Code Skill 同梱** (`.agents/skills/coscli/SKILL.md`) — AI エージェントが coscli を安全・効率的に使うための取扱説明書

## インストール

### Homebrew (macOS / Linux)

```bash
brew tap mtane0412/coscli
brew install coscli
```

### バイナリをダウンロード

[Releases](https://github.com/mtane0412/coscli/releases) から OS に合ったバイナリをダウンロードしてください。

| OS | アーキテクチャ | ファイル名 |
|---|---|---|
| macOS | Apple Silicon (M1〜) | `cos-darwin-arm64` |
| macOS | Intel | `cos-darwin-x64` |
| Linux | x86_64 | `cos-linux-x64` |
| Linux | ARM64 | `cos-linux-arm64` |
| Windows | x86_64 | `cos-windows-x64.exe` |

```bash
# macOS / Linux の例
curl -L https://github.com/mtane0412/coscli/releases/latest/download/cos-darwin-arm64 -o /usr/local/bin/cos
chmod +x /usr/local/bin/cos
```

### 依存パッケージのセットアップ

`cos auth login` はセッション情報を OS キーチェーンに保存します。以下の追加セットアップが必要な場合があります。

#### Linux (libsecret / secret-tool)

```bash
# Ubuntu / Debian
sudo apt install libsecret-tools

# Fedora
sudo dnf install libsecret

# Arch Linux
sudo pacman -S libsecret
```

インストール後、GNOME Keyring または KWallet が起動していることを確認してください。

#### Windows (CredentialManager)

PowerShell を管理者権限で起動し、以下を実行してください。

```powershell
Install-Module CredentialManager -Scope CurrentUser -Force
```

#### ファイル代替ストアを使う場合 (全 OS)

キーチェーンが利用できない環境（CI、コンテナ、WSL など）では、
`--insecure-file-store` フラグを使うとセッション情報をファイルに保存できます。

```bash
cos auth login --insecure-file-store
```

> **注意:** ファイルストアは暗号化されません。CI 環境では環境変数 `COS_SID` を使うか、
> シークレット管理ツールと組み合わせることを推奨します。

## クイックスタート

### 1. ログイン

```bash
# 対話入力でログイン
cos auth login

# --sid フラグで直接指定 (CI / エージェント向け)
cos auth login --no-input --sid "s%3Axxxxxxxx..."
```

ブラウザで Cosense にログイン後、DevTools → Application → Cookies から `connect.sid` の値をコピーしてください。

### 2. 動作確認

```bash
cos auth whoami
cos project list
```

### 3. ページ操作

```bash
# ページ一覧
cos page list --project myproject

# ページ取得
cos page get --project myproject "ページタイトル"

# ページ作成 (PAT 必須: 2 ステップ)
cos page new preview "新しいページ" --line "本文" -p myproject
cos page edit submit <previewId> -p myproject
```

## コマンド一覧

### 読み取り

```
cos page list     ページ一覧を取得 (--pinned でピン留めページのみ表示、--icon <name> でアイコンフィルタ)
cos page get      ページ取得の統合コマンド。--format で出力形式を指定する
                  --format text      本文テキスト (コードブロックなし)
                  --format md        本文を Markdown に変換
                  --format scrapbox  Cosense 記法のまま出力
                  --format ai        AI 向け Markdown (メタデータ + 本文 + 1-hop リンク先)
                  --format context   Smart Context — リンク先本文を XML 形式で取得 (AI 文脈注入に最適)
                                       --hops 2 で 2hop まで広げる、--query でキーワードフィルタ
                  --format code      コードブロック取得 (要 --filename <name>)
                  --format table     テーブルを CSV で取得 (要 --filename <name>)
                  --format url       ページの URL を出力
                  --format icon      ページアイコン取得 URL を出力
cos page infobox  LLM 生成 infobox データを取得
cos page watch    ページ更新をリアルタイム監視 (WebSocket)
cos page history  コミット履歴を取得 (--page-id でリネーム後も追跡、--since で差分取得)

cos page line get  指定行または範囲を取得

cos page snapshot list  スナップショット一覧を取得
cos page snapshot get   特定スナップショットを取得

cos project list    参加プロジェクト一覧を取得
cos project info    プロジェクト情報を取得
cos project members プロジェクトメンバー一覧を取得
cos project stream  プロジェクトの最近更新フィードを取得 (--watch でポーリング監視)
cos project graph   ページ間リンクをグラフとして export する (DOT / JSON / TSV)
cos project search  参加プロジェクト全体を横断してプロジェクトを検索する

cos watch-list list    ウォッチリストのプロジェクト一覧を表示する

cos search  全文検索 (--vector でベクトル検索、--infobox で infobox 定義ページを検索)
```

### 書き込み (PAT 必須、2 ステップ: preview → submit)

```
cos page edit preview  書き込みの統合コマンド。--op で操作を指定して previewId を取得する (PAT 必須)
                       --op append        ページ末尾に行を追記 (--text で指定)
                       --op prepend       ページ先頭 (タイトル直後) に行を挿入 (--text で指定)
                       --op insert        指定行の後ろに挿入 (--after <n> または --after-id <id>、--text で指定)
                       --op line-replace  指定行を置換、改行禁止 (--line-number <n>、--text で指定)
                       --op line-delete   指定行または範囲を削除 (--line-number <n> または --range a:b)
                       --op new-page      新規ページを作成 (--text で本文指定)
                       --op ops           ops JSON で細かく制御 (--ops '{"ops":[...]}')
cos page edit submit   previewId を確定コミットに変換 (PAT 必須)
```

### SID 必須コマンド

以下のコマンドは PAT では実行できません。`connect.sid` を持つ SID 認証が必要です。

```
cos page rename       ページタイトルを変更 (--update-links でリネーム後に被リンクを一括更新) [SID 必須]
cos page update-links プロジェクト内のリンクを一括置換する [SID 必須]
cos page pin          ページをピン留め [SID 必須]
cos page unpin        ページのピン留めを解除 [SID 必須]
cos page delete       ページを削除 [SID 必須]
cos sync push         ローカル → Cosense へ push する (楽観ロック) [SID 必須]
```

### 非推奨コマンド (v0.10.0 で deprecated、警告あり)

> [deprecated] 以下のコマンドは引き続き使用できますが、次のメジャーバージョンで削除される予定です。

```
cos page text     → cos page get --format=text (または --format=md) を使ってください
cos page context  → cos page get --format=context を使ってください
cos page code     → cos page get --format=code --filename=<name> を使ってください
cos page table    → cos page get --format=table --filename=<name> を使ってください
cos page url      → cos page get --format=url を使ってください
cos page icon     → cos page get --format=icon を使ってください

cos page append preview   → cos page edit preview --op=append を使ってください
cos page prepend preview  → cos page edit preview --op=prepend を使ってください
cos page insert preview   → cos page edit preview --op=insert を使ってください
cos page new preview      → cos page edit preview --op=new-page を使ってください
cos page line replace preview  → cos page edit preview --op=line-replace を使ってください
cos page line delete preview   → cos page edit preview --op=line-delete を使ってください
```

### 認証・設定・ユーティリティ

```
cos auth add       API 検証なしで認証情報を直接 keychain に保存する (non-interactive / CI 向け)
cos auth login     認証ログイン (--sid / --pat でクレデンシャルを直接渡す)
cos auth logout    ログアウト
cos auth whoami    現在のログインユーザーを表示
cos auth list      登録済みプロファイルを一覧表示する (alias: ls)
cos auth status    現在のアクティブ認証情報と解決経路を表示する
cos auth doctor    全プロファイルの健全性を検査する
cos auth use       デフォルトプロファイルを切り替える (--unset で削除)
cos auth migrate   旧 config.serviceAccounts の SA キーを keychain に移行する

cos watch-list add     プロジェクトをウォッチリストに追加する
cos watch-list remove  プロジェクトをウォッチリストから削除する

cos config get    設定値を取得
cos config set    設定値を保存
cos config path   設定ファイルのパスを表示

cos sync pull     Cosense → ローカルへ pull する
cos sync diff     ローカルと Cosense の差分を表示する

cos convert       Scrapbox 記法と Markdown を相互変換する

cos serve         ローカル REST プロキシサーバーを起動する (AI エージェント向け)

cos notation [topic]  Cosense 記法ガイドを出力する (引数なし→トピック一覧、指定時→個別トピック)
                      topic: basics / list / link / hashtag / image / icon / decoration /
                             inline-code / code-block / mermaid / table / quote / math /
                             cli / helpfeel / location / tips
cos exit-codes    終了コード一覧を出力する (エージェント向け)
cos schema        コマンド/フラグのスキーマを JSON で出力する (エージェント向け)
```

## Markdown 変換

`@progfay/scrapbox-parser` を使って Scrapbox 記法と Markdown を相互変換します。

### Scrapbox → Markdown でページ取得

```bash
cos page text "ページタイトル" --format=md
```

`--bold-style` オプションで `[* ...]` などの太字記法の解釈を変えられます。

| 値 | 動作 |
|---|---|
| `auto` (デフォルト) | 行全体が太字記法のみの場合は見出し、インラインは太字 |
| `heading` | 常に見出しに変換 |
| `emphasis` | 常に太字 `**text**` に変換 |

```bash
cos page text "ページタイトル" --format=md --bold-style=heading
```

### AI エージェント向け ops ベース編集 (PAT 必須)

編集系コマンドはすべて **Personal Access Token (PAT) が必要**な 2 ステップ方式です。
`preview` で変更内容を dry-run して `previewId` を取得し、`cos page edit submit <previewId>` で確定します。

```bash
# ページ末尾に行を追加
cos page append preview "ページタイトル" -p my-project --line "追加する行"
cos page edit submit "プレビューID" -p my-project

# ページ先頭（タイトル直後）に行を挿入
cos page prepend preview "ページタイトル" -p my-project --line "先頭行"
cos page edit submit "プレビューID" -p my-project

# 指定行の後ろに挿入 (--after で 1-indexed 行番号、--after-id で lineId 直接指定)
cos page insert preview "ページタイトル" -p my-project --after 3 --line "挿入行"
cos page edit submit "プレビューID" -p my-project

# 指定行を置換 (改行禁止)
cos page line replace preview "ページタイトル" -p my-project --line 3 --text "新しい内容"
cos page edit submit "プレビューID" -p my-project

# 指定行または範囲を削除
cos page line delete preview "ページタイトル" -p my-project --line 3
cos page line delete preview "ページタイトル" -p my-project --range 3:5
cos page edit submit "プレビューID" -p my-project

# 新規ページ作成
cos page new preview "新しいページ" -p my-project --line "本文1行目"
cos page edit submit "プレビューID" -p my-project
```

`cos page edit preview` は ops JSON を直接指定する低レベル API です:
```bash
# 1. ページの現在の行 ID を取得
cos page get "ページタイトル" --json -p my-project | jq '.data.lines[] | {id, text}'

# 2. ops JSON を構築して preview (previewId を取得)
cos page edit preview "ページタイトル" -p my-project \
  --ops '{"ops":[{"insertBefore":"_end","text":"追加する行"}]}'

# 3. previewId を使って確定
cos page edit submit "プレビューID" -p my-project
```

ops フォーマット:
- `{"insertBefore": "<lineId>|_end", "text": "テキスト"}` — 指定行の前または末尾に挿入
- `{"replace": "<lineId>", "text": "テキスト"}` — 指定行を置換
- `{"delete": "<lineId>"}` — 指定行を削除

### stdin/stdout 純粋変換

```bash
# Scrapbox → Markdown
echo "[*** 大見出し]" | cos convert --from=scrapbox --to=md

# Markdown → Scrapbox
echo "## 大見出し" | cos convert --from=md --to=scrapbox

# ファイルから変換
cos convert --from=scrapbox --to=md --from-file page.txt --to-file page.md
```

### 既知の制約

- `[/ italic]` ↔ `*italic*` の往復では `_italic_` (Markdown 別表記) は復元できない
- 番号付きリスト `1.` `2.` は Scrapbox でネイティブサポートされないためインデント付き行に縮約される
- `code:filename` のファイル名情報は ` ```filename ``` ` で保持するが、一部の Markdown パーサで認識されない可能性がある

## AI エージェント向け使い方

### Claude Code Skill (.agents/skills/coscli/SKILL.md)

`.agents/skills/coscli/SKILL.md` は Claude Skills 形式のエージェント向け取扱説明書です。認証方式ごとの制約・sandbox 設計・楽観ロック・`--dry-run` 必須といった暗黙ルールをまとめています。

Claude Code から coscli を使う場合は `~/.claude/skills/coscli/` に配置してください。

```bash
# Homebrew / バイナリインストール済みの場合: curl でダウンロード
mkdir -p ~/.claude/skills/coscli
curl -sSL https://raw.githubusercontent.com/mtane0412/coscli/main/.agents/skills/coscli/SKILL.md \
  -o ~/.claude/skills/coscli/SKILL.md

# リポジトリを clone 済みの場合: symlink (リポジトリ更新が即時反映)
mkdir -p ~/.claude/skills
ln -s "$(pwd)/.agents/skills/coscli" ~/.claude/skills/coscli
```

最新コマンド定義は `cos schema --json` から動的取得できます。

### `--wrap-untrusted` — プロンプトインジェクション対策

ページ本文など外部取得テキストを `<external_content>` タグで囲んで出力します。悪意ある Cosense ページが指示を埋め込んでいても、タグ外の信頼コンテキストと分離できます。

```bash
# AI Markdown 取得時にラップ
cos page get "ページ名" --format=ai --wrap-untrusted --project myproject

# テキスト取得時にラップ
cos page get "ページ名" --format=text --wrap-untrusted --project myproject
```

### `--enable-commands-exact` — 最小権限の明示的許可

`--enable-commands` のワイルドカード (`page` / `page.*`) を無効化し、完全一致のみ許可します。AI エージェントが最小権限で動作させる場合に使用します。

```bash
cos --enable-commands "page.get,page.list" \
    --enable-commands-exact \
    page get "ページ名" --project myproject --format=ai
```

### トップレベル alias — よく使う操作の短縮コマンド

```bash
cos get "ページ名" --format=ai -p myproject    # cos page get の alias
cos ls -p myproject --json                      # cos page list の alias
cos edit "ページ名" --op=append --text "行" -p myproject  # cos page edit preview の alias
```

### infobox でページ構造データを取得

`cos page infobox` は Cosense が LLM で生成した infobox データ（キー・バリュー構造）を取得します。infobox はすべてのページに存在するわけではなく、Cosense 側が生成済みのページでのみ有効です。存在しない場合は空のリストが返ります。

```bash
cos page infobox "ページタイトル" --project myproject --json

# hallucination フラグが立ったアイテムを除外する
cos page infobox "ページタイトル" --project myproject --no-hallucination --json
```

### Service Account 認証 (CI / エージェント向け)

対話ログインが難しい環境では、Service Account Access Key を使った認証が利用できます。SA キーは OS キーチェーンにプロファイルとして保存されます。

```bash
# 環境変数で都度渡す場合 (キーチェーン登録不要)
COS_SERVICE_ACCOUNT_KEY="cs_xxxx..." cos page list --project myproject

# 旧 config.serviceAccounts 形式からキーチェーンへ移行する
cos auth migrate
cos auth migrate --dry-run          # 変更計画のみ確認
cos auth migrate --set-default cs_myproject  # 移行後にデフォルトプロファイルを設定
```

### `cos auth add` — API 検証なしでキーチェーンに直接保存 (CI / エージェント向け)

`cos auth login` が API へのアクセスを検証するのに対して、`cos auth add` はネットワーク不要で認証情報を直接キーチェーンに保存します。

```bash
# SID を直接指定して保存
cos auth add --type sid --key "s%3Axxxxxxxx..." --profile 個人

# PAT を環境変数経由で保存 (argv に secret を露出させない CI フレンドリーパターン)
cos auth add --type pat --key-env MY_PAT_TOKEN --profile ci-readonly

# SA Key を stdin から読み込んで保存し、デフォルトプロファイルに設定する
echo "cs_xxxx..." | cos auth add --type sa --key-stdin --project myproject --set-default
```

**入力モード (排他)**:

| フラグ | 説明 |
|---|---|
| `--key <value>` | 値を引数に直接渡す |
| `--key-env <ENV_NAME>` | 環境変数名を渡し、その変数の値を使う |
| `--key-stdin` | stdin から読み取る (末尾改行を自動 trim) |

> **移行案内**: `cos auth sa add` を使って登録した SA キーは `config.serviceAccounts` に保存されています。`cos auth migrate` を実行してキーチェーンに移行してください。

### Personal Access Token (PAT) 認証 (AI エージェント向け)

Cosense が発行する Personal Access Token (PAT) を使った**読み取り専用**認証が利用できます。PAT は `pat_` で始まる 68 文字のトークンで、アカウント設定から発行・失効できます。

```bash
# PAT をキーチェーンに保存してログイン
cos auth login --pat "pat_xxxxxxxxxxxx..."

# 認証状態を確認 (authMethod: "pat" と表示される)
cos auth whoami

# 環境変数で都度渡す場合 (ログイン不要)
COS_PERSONAL_ACCESS_TOKEN="pat_xxxx..." cos page list --project myproject
```

**制限事項:**

- PAT は**読み取り系 REST** および **v2 AI 編集 API** (`page edit preview` / `page edit submit`) に対応しています
- `page pin`、`sync push` 等の WebSocket 書き込みコマンドは `connect.sid` が必要です
- v2 AI 編集 API は **PAT 限定**であり、connect.sid / Service Account Key では HTTP 403 になります

**AI エージェントへの credential 提供として推奨:**

| 認証方法 | 読み取り | v2 AI 編集 | WebSocket 書き込み | 個別失効 |
|---|---|---|---|---|
| connect.sid | ✓ | ✗ | ✓ | ✗ (全ログアウトが必要) |
| Service Account Key | ✓ | ✗ | ✗ | ✓ |
| **PAT** | **✓** | **✓** | **✗** | **✓** |

AI エージェントには **PAT** が最も適しています。読み取りと ops ベース編集に対応し、個別失効も可能です。

**認証情報の保存先とプロファイルの関係:**

| 認証方式 | 保存先 | 識別キー | `--profile` の影響 |
|---|---|---|---|
| connect.sid | OS キーチェーン | プロファイル名 | あり |
| PAT | OS キーチェーン | プロファイル名 | あり |
| Service Account Key | OS キーチェーン | プロファイル名 | あり |

全認証方式が統一的にプロファイルとして管理されます。別プロファイルを使うか環境変数（`COS_SID` / `COS_PERSONAL_ACCESS_TOKEN` / `COS_SERVICE_ACCOUNT_KEY`）で使い分けてください。

**認証解決の優先順位:**

1. 環境変数 `COS_PERSONAL_ACCESS_TOKEN`（PAT）
2. 環境変数 `COS_SERVICE_ACCOUNT_KEY`（SA キー、`COS_PROJECT` / `--project` を `defaultProject` として使用）
3. 環境変数 `COS_SID`（SID、`--profile` 未指定時のみ）
4. `--profile <name>` フラグ → キーチェーンから取得
5. `COS_PROFILE` 環境変数 → キーチェーンから取得
6. `config.defaultProfile` → キーチェーンから取得
7. `"default"` プロファイル → キーチェーンから取得

### マルチプロファイル管理

複数の Cosense アカウントや認証方式を「プロファイル」として使い分けられます。

```bash
# プロファイルを保存する (--profile で名前を指定)
cos auth add --type sid --key "s%3Axxx..."        --profile 個人
cos auth add --type pat --key "pat_xxx..."         --profile ci-readonly
cos auth add --type sa  --key "cs_xxx..." --project myproject --profile cs_myproject

# 一覧確認
cos auth list

# 現在どのプロファイルが使われているか確認
cos auth status

# デフォルトを切り替える
cos auth use 個人

# コマンド実行時に一時的に指定
cos page list --project myproject --profile ci-readonly

# デフォルト設定を解除する (7 位の "default" プロファイルにフォールバック)
cos auth use --unset

# 全プロファイルの健全性チェック
cos auth doctor

# 特定プロファイルを削除する
cos auth logout --profile ci-readonly
```

環境変数 `COS_PROFILE` でもプロファイルを指定できます（`--profile` フラグより優先度は低い）:

```bash
export COS_PROFILE=ci-readonly
cos page list --project myproject
```

#### キーの渡し方

`--key` / `--key-env` / `--key-stdin` はどの `--type` でも使えます。

```bash
# --key: 値を直接渡す (最もシンプル)
cos auth add --type sid --key "s%3Axxx..." --profile 個人

# --key-env: 環境変数名を渡す (argv に secret を露出させたくない CI 向け)
cos auth add --type pat --key-env MY_PAT_TOKEN --profile ci-readonly

# --key-stdin: ファイルやパイプから渡す
cos auth add --type sa --key-stdin --project myproject --profile cs_myproject < sa-key.txt
```

### Smart Context でリンク先ページの文脈を取得

`cos page context` は Cosense の [Smart Context](https://cosen.se/) 機能を使い、指定ページを起点に 1hop / 2hop 先のリンク先ページ本文を LLM が読みやすい形式でまとめて取得します。

```bash
# 1hop 先 (デフォルト) — 関連ページの直接リンクを取得
cos page context "ページタイトル" --project myproject

# 2hop 先 — さらに広い文脈を取得
cos page context "ページタイトル" --project myproject --hops 2

# --query でキーワードフィルタ — 本文に「機械学習」を含むページのみ返す
cos page context "ページタイトル" --project myproject --query "機械学習"

# JSON 出力 (エージェント向け)
cos page context "ページタイトル" --project myproject --json
```

### JSON 出力

```bash
cos page list --project myproject --json | jq '.results[].title'
```

### sandbox でコマンドを制限

```bash
# 読み取りのみ許可 (CLI フラグ)
cos --enable-commands "page.list,page.get,page.text,page.code" page list --project myproject

# 削除を禁止 (CLI フラグ)
cos --disable-commands "page.delete" page list --project myproject
```

設定ファイルで永続化することもできます。

```json5
{
  // 全プロジェクト共通の絶対禁止コマンド (CLI フラグで上書き可能)
  disableCommands: ["page.delete"],
  // projects に未列挙のプロジェクトへの既定権限
  // "read": 読み取り系コマンドのみ / "readwrite": 全許可 / "none": 全拒否
  defaultPermission: "read",
  projects: {
    // プロジェクト固有設定 (defaultPermission を上書き)
    myproject: {
      permission: "readwrite",   // このプロジェクトは全許可 (disableCommands は引き続き適用)
    },
    "read-only-wiki": {
      permission: "read",        // 読み取り専用
    },
    "locked-project": {
      permission: "none",        // 完全ブロック
    },
  },
}
```

優先順位: **CLI フラグ > 環境変数 (`COS_ENABLE_COMMANDS` / `COS_DISABLE_COMMANDS`) > プロジェクト固有設定 > `defaultPermission` > 全許可**

sandbox 違反時は exit code 7 で終了します。

### --no-input

対話プロンプトを完全に無効化します。CI やエージェントからの呼び出しに使用してください。

```bash
cos auth login --no-input --sid "$COS_SID"
```

## 設定

### 設定ファイルの場所

設定ファイルは **JSON5 形式** (コメント・末尾カンマ可) です。

| OS | デフォルトパス |
|---|---|
| macOS / Linux | `~/.config/coscli/config.json5` |
| XDG 環境 | `$XDG_CONFIG_HOME/coscli/config.json5` |

```bash
cos config path          # 現在の設定ファイルパスを確認
cos config get <key>     # 設定値を取得
cos config set <key> <value>  # 設定値を保存
```

### 設定リファレンス

#### 基本設定

| キー | 型 | 説明 |
|---|---|---|
| `defaultProject` | string | `--project` 省略時のデフォルトプロジェクト名 (注: sandbox の権限解決では使用されない — `defaultPermission` はプロジェクトを明示指定した場合にのみ適用される) |
| `defaultProfile` | string | 認証プロファイル名 (未設定: `"default"`) |
| `watchlist` | string[] | ウォッチリストに登録されたプロジェクト名の一覧 (`cos watch-list` で管理) |
| `autoWatchlist` | boolean | `true` にすると `--project` 指定時にそのプロジェクトをウォッチリストへ自動追加する |

#### 出力設定 (`output`)

| キー | 型 | 説明 |
|---|---|---|
| `output.color` | `"auto"` \| `"always"` \| `"never"` | カラー出力モード (未設定: `"auto"`) |
| `output.json` | boolean | 常に `--json` を有効にする |
| `output.plain` | boolean | 常に `--plain` (TSV) を有効にする |

**出力フォーマットの選択指針:**

| フォーマット | フラグ | 用途 |
|---|---|---|
| 整列テキスト (デフォルト) | なし | 端末での確認・AI エージェントへの渡し |
| TSV | `--plain` | `awk` / `cut` 等のスクリプト処理 |
| JSON | `--json` | jq との組み合わせ・構造化データ処理 |

#### コマンド権限設定

| キー | 型 | 説明 |
|---|---|---|
| `disableCommands` | string[] | 全プロジェクト共通の絶対禁止コマンドリスト |
| `defaultPermission` | `"read"` \| `"readwrite"` \| `"none"` | `projects` に未列挙のプロジェクトへの既定権限 (プロジェクト指定時のみ有効) |

`defaultPermission` / `projects.<name>.permission` の値の意味:

| 値 | 効果 |
|---|---|
| `"read"` | 読み取り系コマンドのみ許可 (page.get, page.list, search 等) |
| `"readwrite"` | 全コマンドを許可 |
| `"none"` | 全コマンドを拒否 |

#### プロジェクト固有設定 (`projects.<name>`)

| キー | 型 | 説明 |
|---|---|---|
| `projects.<name>.defaultSort` | string | ページ一覧のデフォルトソート順 |
| `projects.<name>.defaultLimit` | number | ページ一覧のデフォルト件数 |
| `projects.<name>.permission` | `"read"` \| `"readwrite"` \| `"none"` | このプロジェクトの権限プリセット |
| `projects.<name>.enableCommands` | string[] | このプロジェクトで許可するコマンド (細かい制御が必要な場合) |
| `projects.<name>.disableCommands` | string[] | このプロジェクトで禁止するコマンド (細かい制御が必要な場合) |

#### 同期設定 (`sync`)

| キー | 型 | 説明 |
|---|---|---|
| `sync.dir` | string | ローカル同期ディレクトリ |
| `sync.format` | `"txt"` | 同期ファイル形式 |
| `sync.retries` | number (≥0) | 同期失敗時のリトライ回数 |

### 設定例

#### 個人利用 — よく使うプロジェクトを省略する

```bash
cos config set defaultProject myproject
cos config set output.color always
```

これで `--project myproject` を毎回指定しなくてよくなります。

#### AI エージェント向け — コマンドを絞る

AI エージェントに coscli を使わせる際は sandbox 設定で権限を限定できます。

```json5
// ~/.config/coscli/config.json5
{
  defaultProject: "myproject",
  // page.delete は全プロジェクトで絶対禁止
  disableCommands: ["page.delete"],
  // projects に未列挙のプロジェクトは読み取り専用
  defaultPermission: "read",
  projects: {
    // myproject は全操作を許可 (disableCommands の page.delete は引き続き禁止)
    myproject: { permission: "readwrite" },
    // private-notes は完全ブロック
    "private-notes": { permission: "none" },
    // 未列挙プロジェクト → defaultPermission: "read" が適用される
  },
}
```

sandbox の優先順位: **CLI フラグ > 環境変数 > プロジェクト固有設定 > `defaultPermission` > 全許可**

`disableCommands` は CLI フラグ (`--enable-commands`) で上書き可能な絶対禁止リストです。プロジェクトの `permission: "readwrite"` でも無効にはなりません。

#### 設定値を CLI で確認・変更する

```bash
# 現在の設定を確認
cos config get defaultProject
cos config get defaultPermission

# 配列は JSON 形式で渡す
cos config set disableCommands '["page.delete"]'
cos config set projects.myproject.permission readwrite

# 設定ファイルを直接エディタで開く
$EDITOR "$(cos config path)"
```

## 終了コード

機械可読な一覧は `cos exit-codes --json` で取得できます。

| コード | 意味 |
|---|---|
| 0 | 成功 |
| 1 | 一般エラー |
| 2 | 認証エラー (401) |
| 3 | 権限エラー (403) |
| 4 | NotFound (404) |
| 5 | バリデーションエラー |
| 6 | 楽観ロック競合 |
| 7 | sandbox 違反 |
| 124 | タイムアウト |

## Credits

Inspired by [gogcli](https://github.com/openclaw/gogcli) — Google Workspace in your terminal.

`.agents/skills/cosense-notation/SKILL.md` is based on [cosense-notation-skill.md](https://gist.github.com/taiseiue/493e17ed6d95a9fc5881d0701692e77e) by [@taiseiue](https://github.com/taiseiue).

## ライセンス

MIT
