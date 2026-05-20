# coscli

**Cosense in your terminal.**

[Cosense](https://cosen.se/) (旧 Scrapbox) を端末・スクリプト・AI エージェントから操作するための CLI。バイナリ名 `cos`。

## 特徴

- **JSON 出力対応** (`--json`) — AI エージェントや jq と組み合わせやすい
- **sandbox 機能** (`--enable-commands` / `--disable-commands`) — AI エージェントに渡す権限を絞れる
- **マルチプロファイル認証** — OS キーチェーンにセッション情報を安全に保存
- **クロスプラットフォーム** — macOS / Linux / Windows 対応

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

# ページ作成
cos page new --project myproject --title "新しいページ" --body "本文"
```

## コマンド一覧

```
cos page list           ページ一覧を取得
cos page get            ページ本文を取得
cos page text           ページのテキスト (コードブロックなし) を取得
cos page context        ページ起点の Smart Context (リンク先本文) を取得
cos page infobox        LLM 生成 infobox データを取得
cos page find-infobox   infobox 定義を持つページを検索
cos page code           ページのコードブロックを取得
cos page table          ページ内のテーブルを CSV で取得
cos page url            ページの URL を表示
cos page icon           ページアイコン取得 URL を生成する (API 呼び出しなし)
cos page new            ページを作成
cos page edit           ページを編集 (楽観ロック付き)
cos page append         ページ末尾に行を追記
cos page prepend        ページ先頭 (タイトル直後) に行を挿入
cos page insert         指定行の後ろに行を挿入 (--after <n>)
cos page rename         ページタイトルを変更
cos page pin            ページをピン留め
cos page unpin          ページのピン留めを解除
cos page watch          ページ更新をリアルタイム監視 (WebSocket)
cos page history        コミット履歴を取得
cos page delete         ページを削除

cos page line get       指定行または範囲を取得
cos page line replace   指定行または範囲を置換 (rm エイリアスあり)
cos page line delete    指定行または範囲を削除

cos page snapshot list  スナップショット一覧を取得
cos page snapshot get   特定スナップショットを取得

cos project list    参加プロジェクト一覧を取得
cos project info    プロジェクト情報を取得
cos project stream  プロジェクトの最近更新フィードを取得 (--watch でポーリング監視)
cos project graph   ページ間リンクをグラフとして export する (DOT / JSON / TSV)
cos project search  参加プロジェクト全体を横断してプロジェクトを検索する

cos search          全文検索 (--vector でベクトル検索)

cos auth login              認証ログイン (--service-account で Service Account Access Key 認証)
cos auth logout             ログアウト
cos auth whoami             現在のログインユーザーを表示
cos auth service-account    Service Account キー管理 (add / delete / list)

cos config get    設定値を取得
cos config set    設定値を保存
cos config path   設定ファイルのパスを表示

cos sync pull     Cosense → ローカルへ pull する
cos sync push     ローカル → Cosense へ push する (楽観ロック)
cos sync diff     ローカルと Cosense の差分を表示する

cos convert       Scrapbox 記法と Markdown を相互変換する

cos serve         ローカル REST プロキシサーバーを起動する (AI エージェント向け)

cos notation      Cosense 記法ガイドを出力する (エージェント向け)
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

### Markdown ファイルで Scrapbox ページを全置換

```bash
cos page edit "ページタイトル" --from-file page.md --input-format=md
```

> **v0.4.0 非互換変更**: `page edit` はデフォルトで楽観ロックを有効化しました。
> 編集中に他者がページを更新した場合は **exit 6** で停止します。
> 従来の上書き挙動に戻すには `--force` を指定してください。

```bash
# デフォルト: 競合を検知したら exit 6 で停止する
cos page edit "ページタイトル" --from-file new-content.txt

# --force: 他者の編集を上書きする (従来挙動)
cos page edit "ページタイトル" --from-file new-content.txt --force

# --expect-commit: 取得時の commitId を指定して、ページが変わっていれば止める
COMMIT=$(cos page get "ページタイトル" --json | jq -r '.result.commitId')
cos page edit "ページタイトル" --from-file new-content.txt --expect-commit "$COMMIT"
```

### ページ本文のラウンドトリップ (取得→編集)

タイトル行を含まない本文のみを取得して、そのまま `cos page edit` に渡せます:

```bash
cos page text "ページタイトル" --body-only | cos page edit "ページタイトル" --from-file -
```

`--body-only` を指定しない場合は `cos page text` の出力にタイトル行が含まれるため、`cos page edit` 側でタイトル行が本文先頭に重複して挿入されます。

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

### infobox でページ構造データを取得

`cos page infobox` は Cosense が LLM で生成した infobox データ（キー・バリュー構造）を取得します。infobox はすべてのページに存在するわけではなく、Cosense 側が生成済みのページでのみ有効です。存在しない場合は空のリストが返ります。

```bash
cos page infobox "ページタイトル" --project myproject --json

# hallucination フラグが立ったアイテムを除外する
cos page infobox "ページタイトル" --project myproject --no-hallucination --json
```

### Service Account 認証 (CI / エージェント向け)

対話ログインが難しい環境では、Service Account Access Key を使った認証が利用できます。

```bash
# キーを登録する (cs_ で始まる 67 文字のキー)
cos auth service-account add --key "cs_xxxxxxxxxxxx" --project myproject

# 登録済みプロジェクト一覧を確認する
cos auth service-account list

# 登録したキーを削除する
cos auth service-account delete --project myproject
```

登録後は通常の `cos` コマンドが Service Account として動作します。複数プロファイルを使い分ける場合は `--profile` フラグを指定してください。

### Smart Context でリンク先ページの文脈を取得

`cos page context` は Cosense の [Smart Context](https://cosen.se/) 機能を使い、指定ページを起点に 1hop / 2hop 先のリンク先ページ本文を LLM が読みやすい形式でまとめて取得します。

```bash
# 1hop 先 (デフォルト) — 関連ページの直接リンクを取得
cos page context "ページタイトル" --project myproject

# 2hop 先 — さらに広い文脈を取得
cos page context "ページタイトル" --project myproject --hops 2

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

#### 出力設定 (`output`)

| キー | 型 | 説明 |
|---|---|---|
| `output.color` | `"auto"` \| `"always"` \| `"never"` | カラー出力モード (未設定: `"auto"`) |
| `output.json` | boolean | 常に `--json` を有効にする |
| `output.plain` | boolean | 常に `--plain` を有効にする |

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

## ライセンス

MIT
