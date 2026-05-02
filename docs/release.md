# リリース手順メモ

## GitHub Actions によるリリース

`v*` タグを push すると `.github/workflows/release.yml` が自動実行されます。

```bash
git tag v0.2.0
git push origin v0.2.0
```

### ビルドターゲット

| ターゲット | OS | スモークテスト |
|---|---|---|
| bun-darwin-arm64 | macos-latest | ✅ (`--version` 実行) |
| bun-darwin-x64 | macos-latest | ❌ クロスアーキテクチャ |
| bun-linux-x64 | ubuntu-latest | ✅ (`--version` 実行) |
| bun-linux-arm64 | ubuntu-latest | ❌ クロスアーキテクチャ |
| bun-windows-x64 | windows-latest | ✅ (`--version` 実行) |

リリースアーティファクトは GitHub Release ページに自動アップロードされます。

---

## Homebrew tap の設定 (調査メモ)

> **状態:** 調査中。実際の Formula 作成は別 issue で対応予定。

### リポジトリ作成

Homebrew tap は `<username>/homebrew-<name>` という命名規則が必要です。

```bash
# GitHub 上で mtane0412/homebrew-tap リポジトリを作成
gh repo create mtane0412/homebrew-tap --public
```

作成後、ユーザーは以下のコマンドで tap を追加できます。

```bash
brew tap mtane0412/tap
brew install cos
```

### Formula 雛形 (参考)

`Formula/cos.rb` に以下の雛形を作成予定です。実際のバイナリ URL と SHA256 はリリース時に更新します。

```ruby
class Cos < Formula
  desc "AI エージェント親和的 Cosense (Scrapbox) CLI"
  homepage "https://github.com/mtane0412/coscli"
  version "0.2.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mtane0412/coscli/releases/download/v#{version}/cos-darwin-arm64"
      sha256 "PLACEHOLDER_ARM64_SHA256"
    else
      url "https://github.com/mtane0412/coscli/releases/download/v#{version}/cos-darwin-x64"
      sha256 "PLACEHOLDER_X64_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mtane0412/coscli/releases/download/v#{version}/cos-linux-arm64"
      sha256 "PLACEHOLDER_LINUX_ARM64_SHA256"
    else
      url "https://github.com/mtane0412/coscli/releases/download/v#{version}/cos-linux-x64"
      sha256 "PLACEHOLDER_LINUX_X64_SHA256"
    end
  end

  def install
    bin.install Dir["cos-*"].first => "cos"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cos --version")
  end
end
```

### 課題

- SHA256 の自動更新: リリース時に Formula の SHA256 を手動で更新する必要がある
  - `sha256sum` コマンドで取得: `sha256sum cos-darwin-arm64`
  - `release.yml` に SHA256 計算ステップを追加して自動化する方法を検討
- バージョン更新の自動化: `homebrew-autobump` や GitHub Actions で `release.yml` から tap を自動更新する方法を検討
- Windows は Homebrew 非対応のため `winget` / `scoop` を別途検討
