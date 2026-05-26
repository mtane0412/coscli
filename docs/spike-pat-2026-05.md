# Cosense PAT 能力検証レポート (2026-05-26)

## 背景

Cosense に 2026/5 頃から Personal Access Token (PAT) が追加された (`https://scrapbox.io/settings/personal-access-tokens`)。`connect.sid` を PAT で置き換え可能かどうかを実機検証した。

検証スクリプト: `scripts/spike/pat-verify.ts`  
検証日時: 2026-05-26T06:11:16.463Z  
検証プロジェクト: `mtane0412-sandbox`  
比較プロジェクト: `villagepump`

## サマリ

| 項目 | connect.sid | PAT |
|---|---|---|
| `/api/users/me` | ✅ (csrfToken あり) | ✅ **csrfToken なし** |
| listPages | ✅ | ✅ |
| getPageText | ✅ | ✅ |
| searchPages | ✅ | ✅ |
| searchTitles | ✅ | ✅ |
| Smart Context (1hop) | ✅ | ❓ 404 (ページ不在の可能性) |
| searchJoinedProjects | ✅ | ❌ 401 (`NotLoggedInError`) |
| 別プロジェクト読み取り | ✅ | ✅ (アカウント全体で有効) |
| replaceLinks POST | ✅ (CSRF 必要) | ❌ (csrfToken が返らない) |
| WebSocket commit (patch) | ✅ | ❌ タイムアウト |
| WebSocket 購読 (watch) | ✅ | ❌ (同上、接続未確立) |

## 詳細

### 1. `/api/users/me`

- **PAT**: HTTP 200 ✅ だが **`csrfToken` フィールドが含まれない**
- connect.sid 経由では `csrfToken` が返る (`MeSchema` の必須フィールド)
- PAT セッションでは CSRF トークンが発行されない設計と推測される
- レスポンス例: `{"id":"5ae7fecf...","name":"mtane0412","displayName":"たねのぶ",...}`
- 無効な PAT の場合: HTTP 401 `{"name":"InvalidPersonalAccessTokenError","message":"Invalid Personal Access Token."}`

### 2. REST 読み取り API

| endpoint | PAT の HTTP status | 所見 |
|---|---|---|
| `/api/pages/mtane0412-sandbox` | 200 ✅ | 8 ページ中 5 件取得 |
| `/api/pages/mtane0412-sandbox/<title>/text` | 200 ✅ | 公式例通り動作 |
| `/api/pages/mtane0412-sandbox/search/query` | 200 ✅ | 全文検索可能 |
| `/api/pages/mtane0412-sandbox/search/titles` | 200 ✅ | タイトル検索可能 |
| `/api/pages/villagepump` (別 PJ) | 200 ✅ | PAT はアカウント全体で有効 |
| `/api/projects/search/query` | **401 ❌** | `NotLoggedInError` (セッション認証が必要) |
| `/api/smart-context/export-1hop-links/mtane0412-sandbox.txt` | 404 ❓ | テストページが存在しないための 404 と推測 (PAT 制限ではない可能性大) |

### 3. REST POST (replaceLinks)

- `/api/users/me` から csrfToken を取得しようとしたが、PAT セッションでは `csrfToken` フィールドが返らない
- csrfToken なしで POST を送ることは可能だが、CSRF 検証で 403 になる可能性が高い (未検証)
- **実質 POST は不可能** (csrfToken が取得できないため)

### 4. WebSocket commit (`@cosense/std/websocket` の `patch`)

- PAT を `options.sid` パラメータとして渡した場合: **15 秒でタイムアウト**
- `@cosense/std` は内部で WebSocket ハンドシェイク時に `Cookie: connect.sid=<sid>` を送る設計
- PAT を Cookie の sid 値として送っても、Cosense サーバー側が有効な sid として認識しない
- → WebSocket 接続自体が確立しない (TCP 接続の段階か Upgrade のどこかで拒否されていると推測)

### 5. レート制限

- 30 リクエスト連続で 429 が発生しなかった
- Service Account と同等の制限があると仮定していたが、少なくとも 30 req では問題なし
- より高頻度での制限値は未確認

### 6. PAT の権限境界

- アカウントが参加する任意のプロジェクト (`villagepump`) への読み取りは可能
- 「プロジェクト単位」のスコープ指定は発行 UI に見当たらない (アカウント全体で有効)
- 参加プロジェクトリスト取得 (`searchJoinedProjects`) は不可 — アカウント情報系 API は別扱いと推測

## 結論

**シナリオ B 確定: connect.sid の完全廃止は現時点では不可能**

- **PAT で動く**: REST 読み取り系の大部分 (`listPages`, `getPage`, `getPageText`, `searchPages`, `searchTitles` 等)
- **PAT で動かない**: WebSocket commit/購読、REST POST (csrfToken 不要の確認未済)、searchJoinedProjects

### connect.sid を廃止できない理由

1. **WebSocket commit が PAT 非対応** — `@cosense/std/websocket` の `patch`/`pin`/`unpin` が内部で `Cookie: connect.sid=<sid>` を送る設計。PAT を sid に偽装しても接続が確立しない。書き込み系コマンド全て (page new/edit/delete/rename 等) はこの経路に依存
2. **CSRF トークンが PAT セッションで取得不可** — `replaceLinks` (REST POST) に必要な csrfToken が PAT セッションで `/api/users/me` から返ってこない。実質 REST 書き込みも不可能

### PAT 導入の価値 (シナリオ B での実装)

PAT を「第 3 の認証手段」として読み取り系 REST に限定して追加することには以下の価値がある:

- **AI エージェント向け**: Claude Code 等の AI ツールに渡す credential として、`connect.sid` より安全。Cookie より限定的な権限で発行・管理できる
- **revoke が容易**: アカウント全体をログアウトせず個別に無効化できる
- **用途明記**: 発行時に "Purpose" を記入するため、どのツールが使っているか管理しやすい

## 次のアクション (シナリオ B 実装)

- [ ] `CosenseRestClient` のコンストラクタに `personalAccessToken` オプション追加 (`src/core/api/rest.ts:96-110`)
- [ ] `buildHeaders()` で `x-personal-access-token` ヘッダを送る分岐を追加 (`src/core/api/rest.ts:334-344`)
- [ ] `buildRestClient` の認証解決優先順位を更新: PAT > SA Key > sid (`src/commands/_shared.ts:369-413`)
- [ ] `cos auth pat add/delete/list` コマンド追加 (Service Account Key コマンドと同等)
- [ ] `src/schemas/user.ts` の `MeSchema` から `csrfToken` を optional に変更 (PAT 使用時は返らない)
- [ ] `cos auth whoami` で認証種別を表示 (PAT / SA Key / sid を区別)
- [ ] 書き込みコマンドは connect.sid 必須のまま維持

### 上流ライブラリへの期待

`@cosense/std/websocket` が PAT 対応した場合、シナリオ A (完全 sid 廃止) を再検討できる。  
`connect(undefined, sid)` の引数設計から `connect(undefined, patOrSid)` のように PAT を渡せる形になれば、`src/core/api/ws.ts` と `src/core/api/subscribe.ts` の変更で対応可能。

## 追加検証: サーバーの PAT ホワイトリスト設計 (2026-05-26)

さらに書き込み系エンドポイントを PAT で叩き、エラーの種類から「PAT が届いているか」を判別した。

### PersonalAccessTokenNotAllowedError の発見

Cosense サーバーは **エンドポイントごとに PAT を許可するホワイトリストを管理** しており、ホワイトリスト外のエンドポイントに PAT でアクセスすると専用エラーを返す:

```
{"name":"PersonalAccessTokenNotAllowedError","message":"This endpoint is not available via Personal Access Token."}
```

このエラーが返る = PAT 認証は通っているが、このエンドポイントは PAT 対象外。

### エンドポイント別の PAT 到達可否

| エンドポイント | エラー種別 | 解釈 |
|---|---|---|
| `POST /api/page-data/import` | `PersonalAccessTokenNotAllowedError` | PAT 届くが明示ブロック |
| `POST /api/page-data/import-finish` | `PersonalAccessTokenNotAllowedError` | 同上 |
| `GET /api/commits/:p/:pageid` | `NotLoggedInError` | PAT 届いていない |
| `GET /api/page-snapshots/:p/:pageid` | `NotLoggedInError` | PAT 届いていない |
| `GET /api/deleted-pages/:p/:pageid` | `NotLoggedInError` | PAT 届いていない |
| `GET /api/projects/search/watch-list` | `NotLoggedInError` | PAT 届いていない |
| `GET /api/page-data/export/:p.json` | `NotLoggedInError` | PAT 届いていない |
| `POST replace/links` | `SessionError` (CSRF 先行) | PAT 可否不明 |
| `POST /api/upload-request/:p` | `SessionError` (CSRF 先行) | PAT 可否不明 |
| `smart-context 1hop` (存在するページ) | 200 ✅ | 前回の 404 はページ不在が原因 |

### 設計上の結論

Cosense は現在、PAT のホワイトリストを「読み取り系 REST のみ」に限定している。書き込み系のエンドポイントは:
- CSRF チェックを PAT 認証より先に実施する設計 (replaceLinks, upload-request)
- または PAT 認証は通るが明示的に `PersonalAccessTokenNotAllowedError` を返す (import)

いずれのパターンも書き込みは PAT では不可能。`PersonalAccessTokenNotAllowedError` という専用エラーが存在することから、将来的に shokai が PAT のホワイトリストを拡張すれば書き込み API が開放される可能性はある。

## 未検証項目

- Smart Context API: ✅ 解決済み。存在するページで 200 確認
- replaceLinks POST の CSRF なし動作: `SessionError` が先に返るため PAT 可否は不明 (実用的には不可)
- 有効期限: 設定 UI に見当たらず、無期限かどうか未確認
- revoke 後の即時無効化: 手動確認が必要
- `PersonalAccessTokenNotAllowedError` を返すエンドポイントが将来 PAT 対応に格上げされた場合の追跡

## 実装フェーズでの PAT サポート追加 (2026-05)

本スパイクの検証結果を受けて、以下の 3 PR で coscli に PAT サポートを追加した。

### PR#1 `feature/pat-rest-client` — REST クライアント拡張 + バリデータ

- `PAT_PATTERN = /^pat_[0-9a-f]{64}$/` と `PersonalAccessTokenValidationError` を追加
- `assertValidSid` に `pat_` 拒否ガードを追加 (SID_PATTERN が `pat_` を素通しする問題を明示対処)
- `CosenseRestClientOptions.personalAccessToken` を追加し、3-way 排他チェックを実装
- `buildHeaders()` で PAT を最優先 (`x-personal-access-token` ヘッダ)
- `MeSchema.csrfToken` を `.optional()` 化 (PAT セッションでは返らない)
- `replaceLinks()` で `csrfToken === undefined` のとき `AUTH_WRITE_NOT_SUPPORTED` を throw

### PR#2 `feature/pat-auth-login-whoami` — 認証コマンド + buildRestClient 拡張

- `cos auth login --pat <token>` フラグを追加 (`--sid` / `--browser` と排他)
- `buildRestClient` に `COS_PERSONAL_ACCESS_TOKEN` 環境変数の優先チェックを追加
- Keychain の値が `pat_` プレフィックスの場合は PAT クライアントを生成するよう分岐
- `cos auth whoami` に `authMethod: "pat" | "sid"` を出力追加

### PR#3 `feature/pat-write-rejection-docs` — 書き込み拒否 + ドキュメント

- `requireSid()` に PAT 拒否ロジックを追加 (exit 2 + `AUTH_WRITE_NOT_SUPPORTED`)
- `COS_SID` 環境変数への PAT 誤投入も同様に拒否
- README.md と CLAUDE.md に PAT 認証セクションを追加
