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
4. `README.md` のコマンド一覧を更新する
5. `.agents/skills/coscli/SKILL.md` の該当 noun.verb が登場する箇所 (読み取り/書き込みセクション、sandbox 識別子テーブル) を更新する
6. `src/core/schema-metadata.ts` の `SCHEMA_COMMAND_METADATA` にコマンドメタデータを登録する (詳細は下記)

**コマンドの変更・削除時も同様に `README.md` および `.agents/skills/coscli/SKILL.md` を更新すること。**

#### deprecated verb を追加するとき

新コマンドへの旧 alias として deprecated verb を作る場合は以下の手順に従う:

1. **実装ファイル冒頭** に `@deprecated` JSDoc を付ける
2. コマンド実行時に `warnDeprecated(oldCommand, replacement, warnings)` を呼ぶ
   (`src/commands/_deprecation.ts` の `warnDeprecated` 関数を使用)
3. JSON 出力時は `writeJson(data, { ..., meta: { canonicalCommand: "...", deprecated: { since: DEPRECATION_SINCE, replacement: "..." } } })` を渡す
4. `src/core/schema-metadata.ts` の `SCHEMA_COMMAND_METADATA` に `canonicalId` と `deprecated` を登録する

#### `SCHEMA_COMMAND_METADATA` への登録手順

`src/core/schema-metadata.ts` の `SCHEMA_COMMAND_METADATA` オブジェクトに追加する:

```ts
// 正規コマンドの例
"page.edit.preview": {
  requiresAuthKind: "pat",   // "any" | "pat" | "sid" | "none"
  permissionKind: "write",   // "read" | "write" | "destructive" | "config" | "meta"
  examples: [...],           // オプション
},

// deprecated verb の例
"page.append.preview": {
  requiresAuthKind: "pat",
  permissionKind: "write",
  canonicalId: "page.edit.preview",   // 正規コマンドの ID
  deprecated: { since: D, replacement: "page edit preview --op=append" },
},
```

`D` は `const D = "v0.10.0"` のように deprecated が導入されたバージョン文字列。

### alias ルール

トップレベル alias は citty で別 command として二重登録している。
alias を追加・変更する際は `src/cli.ts` の「エイリアス登録」セクションを必ず同時に更新すること。
また `.agents/skills/coscli/SKILL.md` の該当 alias 記述 (`cos page snapshot ls`、`cos page line rm`、`cos auth me` など) も同時に更新すること。

sandbox alias (`src/core/sandbox/aliases.ts`) が存在する場合、alias の追加・変更時には当該ファイルも同時に更新すること。

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
│   │   ├── credential.ts        # Credential タグ付きユニオン型・判別関数
│   │   ├── credential-store.ts  # CredentialStore interface + アダプタ
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

## 認証システム

SID / PAT / SA Key の 3 方式を `Credential` タグ付きユニオン (`src/core/auth/credential.ts`) で統一管理。

### Credential 型

```ts
type Credential =
  | { kind: "sid"; value: string; defaultProject?: string }
  | { kind: "pat"; value: string; defaultProject?: string }
  | { kind: "sa"; value: string; defaultProject: string }
```

`canWrite(cred)` は `cred.kind === "sid"` のみ `true`。

### CredentialStore

`src/core/auth/credential-store.ts` に `CredentialStore` interface と `TokenStoreCredentialAdapter`。keychain 値は `{"kind":"sid"|"pat"|"sa","value":"...","defaultProject"?:"..."}` の JSON エンベロープで保存。旧平文 SID/PAT は legacy 互換で自動解釈。

### resolveActiveCredential の 7 段優先順位

1. `COS_PERSONAL_ACCESS_TOKEN` env → PAT Credential
2. `COS_SERVICE_ACCOUNT_KEY` env → SA Credential
3. `COS_SID` env (profile 未指定時のみ、`pat_*` は警告付きで受理)
4. `--profile <name>` フラグ → keychain
5. `COS_PROFILE` env → keychain
6. `config.defaultProfile` → keychain
7. `"default"` プロファイル → keychain

`requireSid` は `canWrite` が false なら exit 2 + `AUTH_WRITE_NOT_SUPPORTED`。

### PAT 制約

PAT (`pat_` + 64桁小文字16進数、ヘッダ `x-personal-access-token`) の能力一覧は `src/core/auth/capabilities.ts` の `AUTH_CAPABILITIES.pat` が単一の事実ソース。

概要:
- **v2 AI ops API 書き込み可**: `page edit preview / submit`、`page append preview` 等 (v2 AI ops 移行済みコマンド)
- **旧 WebSocket commit は不可**: `page delete`、`page pin`、`sync push` 等は `connect.sid` が必要
- **csrfToken 欠落**: PAT セッションでは `/api/users/me` が csrfToken を返さない。`MeSchema.csrfToken` は `.optional()` にしてある
- **`replaceLinks` ガード**: `csrfToken === undefined` のとき `AUTH_WRITE_NOT_SUPPORTED` を throw

### SA Key の管理

SA キーは OS キーチェーンにプロファイル名 `cs_<project>` で保存。旧 `config.serviceAccounts` からの移行は `cos auth migrate` で行う。

## 終了コード

機械可読な一覧は `cos exit-codes --json` で取得できます（単一ソース: `src/core/exit-codes.ts`）。

| code | 意味 |
|---|---|
| 0 | 成功 |
| 1 | 一般エラー |
| 2 | 認証エラー (401) / PAT で書き込み試行 (AUTH_WRITE_NOT_SUPPORTED) |
| 3 | 権限エラー (403) |
| 4 | NotFound (404) |
| 5 | バリデーションエラー |
| 6 | 楽観ロック競合 |
| 7 | sandbox 違反 |
| 124 | timeout |
