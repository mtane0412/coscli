# coscli

AI エージェント親和的な [Cosense](https://cosen.se/) (旧 Scrapbox) CLI。バイナリ名 `cos`。

## 特徴

- **JSON 出力対応** (`--json`) — AI エージェントや jq と組み合わせやすい
- **sandbox 機能** (`--enable-commands` / `--disable-commands`) — AI エージェントに渡す権限を絞れる
- **マルチプロファイル認証** — OS キーチェーンにセッション情報を安全に保存
- **クロスプラットフォーム** — macOS / Linux / Windows 対応

## インストール

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
cos page list     ページ一覧を取得
cos page get      ページ本文を取得
cos page text     ページのテキスト (コードブロックなし) を取得
cos page code     ページのコードブロックを取得
cos page url      ページの URL を表示
cos page new      ページを作成
cos page edit     ページを編集
cos page append   ページ末尾に行を追記
cos page delete   ページを削除

cos project list  参加プロジェクト一覧を取得
cos project info  プロジェクト情報を取得

cos search        全文検索

cos auth login    認証ログイン
cos auth logout   ログアウト
cos auth whoami   現在のログインユーザーを表示

cos config get    設定値を取得
cos config set    設定値を保存
cos config path   設定ファイルのパスを表示
```

## AI エージェント向け使い方

### JSON 出力

```bash
cos page list --project myproject --json | jq '.results[].title'
```

### sandbox でコマンドを制限

```bash
# 読み取りのみ許可
cos --enable-commands "page.list,page.get,page.text,page.code" page list --project myproject

# 削除を禁止
cos --disable-commands "page.delete" page list --project myproject
```

sandbox 違反時は exit code 7 で終了します。

### --no-input

対話プロンプトを完全に無効化します。CI やエージェントからの呼び出しに使用してください。

```bash
cos auth login --no-input --sid "$COS_SID"
```

## 設定

設定ファイルは JSON5 形式です。`cos config path` でパスを確認できます。

```json5
{
  // デフォルトプロジェクト
  defaultProject: "myproject",
}
```

## 終了コード

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

## ライセンス

MIT
