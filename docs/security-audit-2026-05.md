# coscli セキュリティ監査レポート (2026-05)

## 概要

**監査日**: 2026-05-12  
**対象バージョン**: v0.2.0 (コミット `016d593`)  
**調査スコープ**: `src/` 全ソース、`tests/` テスト群、依存ライブラリ、CI ワークフロー  
**目的**: 一般ユーザーおよび AI エージェント (Claude Code / Codex / Cursor) からの利用を想定した脅威モデルでの安全性評価  
**最終更新**: 2026-05-14 (全 20 項目対応完了)

### 脅威モデル

| アクター | 想定 |
|---|---|
| 一般ユーザー | CLI を手動実行。誤操作・誤設定による情報漏洩を防ぐ |
| AI エージェント | プロンプトインジェクションで `--from-file` 等の引数を操作される可能性がある |
| ローカル攻撃者 | 同一マシン内の別プロセスから認証情報を読み取ろうとする |
| ネットワーク攻撃者 | `cos serve` を悪用して Bearer トークンを推測・Cookie を盗もうとする |

### 発見件数

| 優先度 | 件数 | 状態 |
|---|---|---|
| Critical | 4 件 | 対応完了 (PR #75–#77) |
| High | 4 件 | 対応完了 (PR #78–#81, #97) |
| Medium | 8 件 | 対応完了 (PR #98–#104、#13 は別 PR) |
| Low | 4 件 | 対応完了 (PR #105–#108) |
| **合計** | **20 件** | **全件対応完了** |

---

## Critical — 即時対応必須

### #1: `--from-file` の無制限ファイル読込

**優先度**: Critical  
**対象ファイル**:
- `src/commands/page/new.ts:57-63`
- `src/commands/page/append.ts:52-58`
- `src/commands/page/prepend.ts:52-69`
- `src/commands/page/insert.ts:80-95`
- `src/commands/page/edit.ts:72-78`

**概要**:  
`--from-file` フラグに任意のファイルパスを渡すと、パスバリデーションなしに `readFileSync(arg, "utf-8")` が実行される。シンボリックリンクの解決もサイズ制限もない。

**攻撃シナリオ**:  
AI エージェントがプロンプトインジェクションで `cos page new "メモ" --from-file ~/.ssh/id_rsa` を実行した場合、SSH 秘密鍵が Cosense の公開プロジェクトに書き込まれる。一般ユーザーもパスの入力ミスで `/etc/passwd` などのシステムファイルを投稿してしまう可能性がある。

**影響**:  
機密ファイル (秘密鍵・環境変数・認証情報) が Cosense プロジェクトに漏洩する。

**推奨対応**:  
- `src/infra/safe-read.ts` を新設し `readFromFile()` / `readStdinBounded()` を実装
- deny list: `/etc`, `/proc`, `/sys`, `/dev`, `/root`, `/boot`, `*.pem`, `*.key`, `*.env`, `*_rsa`, `*_ed25519`, `~/.ssh`, `~/.aws`, `~/.gnupg`, coscli 自身の `secrets.json`
- `realpathSync` でシンボリックリンク解決後にチェック
- 上限 10 MiB
- `--allow-unsafe-read` フラグで例外運用を許可

**本セッションでの扱い**: PR #75 でマージ済み (#2 と同 PR)

---

### #2: stdin / `--from-file` のサイズ無制限

**優先度**: Critical  
**対象ファイル**:
- `src/commands/page/new.ts`, `src/commands/page/append.ts` など (#1 と同じ)
- `src/core/server/rest.ts:91-100` (`parseJsonBody`)

**概要**:  
`readFileSync(0, "utf-8")` は EOF まで全データを読み込む。`cos serve` の `parseJsonBody` にもボディサイズ制限がなく Bun.serve のデフォルトに依存する。

**攻撃シナリオ**:  
AI エージェントやスクリプトが巨大データを stdin に流してメモリを枯渇させる。`cos serve` に大量データを POST して OOM Kill を引き起こす。

**影響**: プロセス強制終了・OOM・意図しない巨大コンテンツの Cosense 書き込み。

**推奨対応**:
- CLI stdin: `readStdinBounded()` に 10 MiB 上限
- serve: `Content-Length` ヘッダと実バッファ両方で 5 MiB 上限、超過時 HTTP 413 を返す

**本セッションでの扱い**: PR #75 で #1 と同時にマージ済み

---

### #3: macOS / Windows keychain で argv 経由の sid 露出

**優先度**: Critical  
**対象ファイル**:
- `src/infra/keychain/macos.ts:23-33` (`save`)
- `src/infra/keychain/windows.ts:49-66` (`save`)

**概要**:  
macOS では `security add-generic-password -w <sid>` の形で connect.sid をコマンドライン引数に渡しており、Linux とは異なり argv 上に sid が露出する。Windows でも `cmdkey /pass:<sid>` で同様の問題がある。

**攻撃シナリオ**:  
`cos auth login --sid "s%3A..."` を実行した瞬間に、同一ユーザーで動く他プロセス (ブラウザ拡張・悪意あるサイドカー) が `ps aux` や `WMI Win32_Process.CommandLine` で connect.sid を取得できる。

**影響**: connect.sid の窃取 → Cosense セッションのハイジャック。

**推奨対応**:
- macOS: `security -w` (値なし) にして stdin から sid を渡す (公式仕様)
- Windows: `cmdkey /pass:` を廃止し PowerShell `New-StoredCredential` + 環境変数 `COS_SID` で sid 渡しに変更

**本セッションでの扱い**: PR #76 でマージ済み

---

### #4: `FileTokenStore` の atomic write 欠如・ディレクトリパーミッション

**優先度**: Critical  
**対象ファイル**:
- `src/infra/keychain/file.ts:39-52`
- `src/infra/config.ts:74-77` (副次的に対応)

**概要**:
1. `writeFileSync(path, ...)` は非 atomic。書き込み中に別プロセスが読むと空/中途半端なデータを得る。
2. 親ディレクトリ `~/.config/coscli/` は `mode` 未指定で `mkdirSync` → `umask 022` だと `0755` になり、他ユーザーがディレクトリ内を `ls` できる。
3. `JSON.parse` 失敗時に silent に空オブジェクトを返すため、ファイル破損を検知できずに上書きして全セッションを消失させる。

**攻撃シナリオ**:  
共有 CI ランナー環境で `secrets.json` が `0755` ディレクトリ内に保存されると、別ユーザーが sid を読める可能性がある。

**影響**: sid 漏洩・セッション全消失 (破損時 silent fallback)。

**推奨対応**:
- `mkdirSync(dir, { mode: 0o700 })` + `chmodSync(dir, 0o700)`
- 一時ファイル + `renameSync` で atomic 書き込み
- `JSON.parse` 失敗時は throw に変更

**本セッションでの扱い**: PR #77 でマージ済み

---

## High — 早期対応推奨

### #5: sandbox のワイルドカード未対応 / case-sensitivity / Unicode whitespace

**優先度**: High  
**対象ファイル**: `src/core/sandbox.ts:51-87`

**概要**:
1. `--disable-commands "*"` は `pattern === command` でリテラル `*` と一致しか試みないため、**全コマンドを deny するつもりで書いたのに何も deny されない**。
2. `Page.List` と `page.list` が別物扱い (大文字小文字区別)。AI エージェントが `Page.List` を渡すと allowlist に登録した `page.list` とマッチせず誤って deny される。
3. `s.trim()` は ASCII whitespace のみ。全角スペースなど Unicode whitespace が含まれると pattern が機能しない。

**攻撃シナリオ**:  
ユーザーが「全コマンドを禁止したい」と `--enable-commands "*"` を設定した場合に全コマンドが許可されてしまう。AI エージェントのコマンド名大文字小文字揺れで sandbox が誤動作する。

**影響**: sandbox policy のバイパス / 誤 deny。

**推奨対応**:
- `normalizeCommand(s)` で Unicode whitespace 除去 + `toLowerCase()`
- `pattern === "*" || pattern === "all"` を全件マッチ扱い
- `pattern.endsWith(".*")` で glob 風サブツリーマッチ (`page.*` → `page.list`, `page.delete` 等)

**本セッションでの扱い**: PR #78 でマージ済み

---

### #6: `setConfigValue` / `getConfigValue` の prototype 汚染

**優先度**: High  
**対象ファイル**: `src/infra/config.ts:81-107`

**概要**:  
`getConfigValue` は `__proto__`, `prototype`, `constructor` のフィルタなしに `record[part]` でアクセスするため、`cos config get __proto__.polluted` で `Object.prototype` の値を返す。`setConfigValue` では `structuredClone` 後に `current[part] = {}` で `part === "__proto__"` の場合、最終 `CoscliConfigSchema.parse(updated)` で strip されるが **parse 前のメモリ上でプロトタイプ汚染が発生**する可能性がある。`config/set.ts:43-47` で `JSON.parse(a.value)` した値をそのまま代入しているため、`cos config set __proto__.isAdmin true` のような入力を受けうる。

**攻撃シナリオ**:  
AI エージェントが設定ファイル操作ツールとして `cos config set __proto__.polluted 1` を実行し、同プロセス内の他ロジックが `({}).polluted` を使用している箇所で意図しない挙動を引き起こす。

**影響**: プロトタイプ汚染によるプロセス内不正動作 (実害到達経路は限定的だが要修正)。

**推奨対応**:
- `FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"])` で入口 reject
- 中間オブジェクトは `Object.create(null)` で純粋オブジェクトを生成
- `loadConfig` 後にディープウォークで forbidden key チェック

**本セッションでの扱い**: PR #79 でマージ済み (入口 reject 実装済み)

**追加対応**: PR #97 で `src/infra/config.ts:119` の中間オブジェクトを `Object.create(null)` に変更し深層防御を完了 (issue #84 クローズ済み)

---

### #7: COS_SID 環境変数 / `--sid` フラグのフォーマット検証なし

**優先度**: High  
**対象ファイル**:
- `src/commands/_shared.ts:205-224` (`requireSid`)
- `src/commands/auth/login.ts:220-249`

**概要**:  
`COS_SID` や `--sid` で受け取った値を、長さ・文字種ともに一切検証せずに `Cookie: connect.sid=${sid}` ヘッダに連結する。CR/LF を含む値を渡すと HTTP ヘッダインジェクションの余地が生じる (fetch 実装側で防がれることが多いが多重防御としてコード側でも検証が必要)。

**攻撃シナリオ**:  
AI エージェントが `COS_SID=$'s%3A...\r\nX-Injected: hdr'` を渡すと、Bun のバージョンや設定によってはヘッダインジェクションが成立し、意図しないリクエストヘッダが送信される。

**影響**: HTTP ヘッダインジェクション (多重防御の欠如)。

**推奨対応**:
- `assertValidSid(sid)` ユーティリティを追加
- 長さ: 1〜4096 文字
- 許可文字: RFC 6265 cookie-octet 範囲 + URL エンコード由来の `%`, `=`, `/`, `+`, `.`

**本セッションでの扱い**: PR #80 でマージ済み

---

### #8: HTTP redirect で Cookie 漏洩の可能性

**優先度**: High  
**対象ファイル**: `src/core/api/rest.ts:209-228` (`doFetch`)

**概要**:  
`fetch(url, { headers, signal })` に `redirect` オプションを指定していないため、デフォルトの `"follow"` が適用される。Cosense API のレスポンスが外部ドメインへ 30x リダイレクトを返した場合、手動でセットした `Cookie: connect.sid=...` ヘッダが外部ホストへ送信される可能性がある (fetch 仕様では same-origin check が Cookie の自動付与には適用されるが、手動セットのヘッダは実装依存)。

**攻撃シナリオ**:  
サプライチェーン攻撃や CDN 設定ミスで `https://scrapbox.io/api/...` が攻撃者制御ドメインへリダイレクトされた場合に connect.sid が漏洩する。

**影響**: connect.sid の第三者漏洩。

**推奨対応**:
- `fetch(url, { headers, signal, redirect: "manual" })` に変更
- 30x 応答の `Location` ヘッダをパースし、same-origin (`https://scrapbox.io`) のみ再フェッチ
- 最大リダイレクト回数 5 回

**本セッションでの扱い**: PR #81 でマージ済み

---

## Medium — 対応完了

### #9: serve Bearer トークンの non-constant-time 比較

**優先度**: Medium  
**対象ファイル**: `src/core/server/rest.ts:62`  
**概要**: `auth !== \`Bearer ${ctx.token}\`` でタイミング攻撃に脆弱。  
**推奨対応**: `crypto.timingSafeEqual` を使用。  
**対応 PR**: PR #98 (issue #85 クローズ)

---

### #10: `cos serve --host 0.0.0.0` で認証なし外部公開

**優先度**: Medium  
**対象ファイル**: `src/commands/serve.ts:146`  
**概要**: `--host` がループバック以外のとき `--token` 未指定なら warn を出すだけで起動を許可する。  
**推奨対応**: ループバック以外 + トークンなしは起動拒否。  
**対応 PR**: PR #99 (issue #86 クローズ)

---

### #11: NotFoundError メッセージに URL クエリ漏洩

**優先度**: Medium  
**対象ファイル**: `src/core/api/rest.ts:52, :233`  
**概要**: NotFoundError のメッセージに URL 全体が含まれ、クエリパラメータ (title, query) がログに残る。  
**推奨対応**: エラーメッセージには pathname のみ含める。  
**対応 PR**: PR #100 (issue #87 クローズ)

---

### #12: keychain の load/delete で profile 名バリデーション欠如

**優先度**: Medium  
**対象ファイル**: `src/infra/keychain/{macos,linux,windows,file}.ts` の `load`, `delete`  
**概要**: `validateProfile` が save 時のみ呼ばれ、load/delete では未呼出。  
**推奨対応**: load/delete の先頭で `validateProfile(profile)` を呼ぶ。  
**対応 PR**: PR #101 (issue #88 クローズ)

---

### #13: serve listPages の skip/limit に負数を許容

**優先度**: Medium  
**対象ファイル**: `src/core/server/rest.ts:149-160`  
**概要**: `/^-?\d+$/` で負数も通る。  
**推奨対応**: `/^\d+$/` に変更し `limit > 1000` は 400 を返す。  
**状態**: 別 PR で修正済み — `src/core/server/rest.ts:191-212` で整数のみ許可 + VALIDATION_ERROR 返却が実装されている

---

### #14: `whoami --json` に csrfToken が含まれる

**優先度**: Medium  
**対象ファイル**: `src/commands/auth/whoami.ts:48`, `src/schemas/user.ts:14`  
**概要**: `MeSchema.csrfToken` が `--json` 出力に含まれ、ログに残ったり git にコミットされる危険がある。  
**推奨対応**: whoami 出力時に `csrfToken` を除外する。  
**対応 PR**: PR #102 (issue #89 クローズ)

---

### #15: `fsname.ts` の Windows 予約名 / 末尾スペース未チェック

**優先度**: Medium  
**対象ファイル**: `src/core/sync/fsname.ts`  
**概要**: `CON`, `PRN`, `NUL`, `COM1-9`, `LPT1-9` 等の Windows 予約名と末尾スペース・ピリオドを検査しない。  
**推奨対応**: WINDOWS_RESERVED 正規表現による拒否、末尾スペース・ピリオドの拒否を追加。  
**対応 PR**: PR #103 (issue #90 クローズ)

---

### #16: sync push の readdir → title 二重防御なし

**優先度**: Medium  
**対象ファイル**: `src/commands/sync/push.ts:172-178`  
**概要**: メタディレクトリの readdir 結果から `.json` を除去して title とするが、`safeFsName(title)` の明示呼出がなく engine.ts 側の検証のみに依存している。  
**推奨対応**: `push.ts` 側でも `safeFsName(title)` を明示的に呼びエラー時はスキップ。  
**対応 PR**: PR #104 (issue #91 クローズ) — `push.ts:172-185` で `safeFsName` を try/catch でラップし不正ファイル名を明示スキップ

---

## Low — 対応完了

### #17: `SearchResultSchema.query` の `.passthrough()` 未制限

**優先度**: Low  
**対象ファイル**: `src/schemas/page.ts:96`  
**概要**: `query` フィールドのみ `.passthrough()` で未知キーが素通りする。  
**対応 PR**: PR #105 (issue #92 クローズ)

---

### #18: config / sync メタファイルのパーミッション

**優先度**: Low  
**対象ファイル**: `src/infra/config.ts:77`, `src/core/sync/meta.ts:39`  
**概要**: `config.json5`, sync メタファイルともに `mode` 指定なし。Critical #4 (PR #77) で `secrets.json` は `0o600` 対応済みだが、config.json5 と sync メタファイルは未対応。  
**対応 PR**: PR #106 (issue #93 クローズ)

---

### #19: `@types/bun: latest` floating tag

**優先度**: Low  
**対象ファイル**: `package.json:37`  
**概要**: `"@types/bun": "latest"` は devDependency だが、ロックなしで `bun install` すると差し替わる。CI は `--frozen-lockfile` を使用しているため実害は限定的。  
**対応 PR**: PR #107 (issue #94 クローズ)

---

### #20: SECURITY.md なし

**優先度**: Low  
**対象ファイル**: リポジトリ直下 `SECURITY.md` (新規作成)  
**概要**: 脆弱性の報告窓口・サポートバージョン・脅威モデルを記載した SECURITY.md が存在しない。  
**対応 PR**: PR #108 (issue #95 クローズ)

---

## 修正状況 (2026-05-14 時点) — 全件対応完了

| # | 概要 | 優先度 | 状態 | PR / issue |
|---|---|---|---|---|
| 1, 2 | `--from-file` / stdin 無制限読込 | Critical | マージ済み | PR #75 |
| 3 | keychain argv 経由 sid 露出 | Critical | マージ済み | PR #76 |
| 4 | FileTokenStore atomic write / dir perm | Critical | マージ済み | PR #77 |
| 5 | sandbox ワイルドカード / case-sensitivity | High | マージ済み | PR #78 |
| 6 | prototype 汚染 (入口 reject + 深層防御) | High | マージ済み (深層防御も完了) | PR #79, #97 (issue #84 クローズ) |
| 7 | sid フォーマット検証 | High | マージ済み | PR #80 |
| 8 | HTTP redirect Cookie 漏洩 | High | マージ済み | PR #81 |
| 9 | serve Bearer non-constant-time 比較 | Medium | マージ済み | PR #98 (issue #85 クローズ) |
| 10 | serve --host 非ループバック時トークン未強制 | Medium | マージ済み | PR #99 (issue #86 クローズ) |
| 11 | NotFoundError URL クエリ漏洩 | Medium | マージ済み | PR #100 (issue #87 クローズ) |
| 12 | keychain load/delete の validateProfile 欠如 | Medium | マージ済み | PR #101 (issue #88 クローズ) |
| 13 | serve listPages skip/limit バリデーション | Medium | 修正済み (別 PR) | — |
| 14 | whoami --json に csrfToken 含む | Medium | マージ済み | PR #102 (issue #89 クローズ) |
| 15 | fsname.ts Windows 予約名 / 末尾 spc・period | Medium | マージ済み | PR #103 (issue #90 クローズ) |
| 16 | sync push の safeFsName 二重防御 | Medium | マージ済み | PR #104 (issue #91 クローズ) |
| 17 | SearchResultSchema.query passthrough | Low | マージ済み | PR #105 (issue #92 クローズ) |
| 18 | config / sync メタファイル mode 指定 | Low | マージ済み | PR #106 (issue #93 クローズ) |
| 19 | @types/bun: latest ピン留め | Low | マージ済み | PR #107 (issue #94 クローズ) |
| 20 | SECURITY.md 新規作成 | Low | マージ済み | PR #108 (issue #95 クローズ) |
