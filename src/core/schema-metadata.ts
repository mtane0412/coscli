/**
 * schema-metadata.ts — cos schema コマンド出力に付与するコマンド固有メタデータレジストリ。
 *
 * citty の CommandDef では表現できない情報 (requiresAuthKind / permissionKind / deprecated / etc.)
 * をコマンド ID (ドット区切り) をキーとして定義する単一ソース。
 *
 * buildSchema が parentId を渡しながら再帰するとき、このマップを参照して
 * SchemaCommand に追加フィールドを付与する。
 *
 * 認証要件の詳細: src/core/auth/capabilities.ts を参照。
 */

import type {
  SchemaCommandConditionalArg,
  SchemaCommandDeprecated,
  SchemaCommandExample,
} from "@/core/schema"

/** SchemaCommandEnrichment は buildSchema が自動付与するコマンド固有メタデータ。 */
export interface SchemaCommandEnrichment {
  requiresAuthKind?: "pat" | "sid" | "any" | "none"
  permissionKind?: "read" | "write" | "destructive" | "config" | "meta"
  canonicalId?: string
  deprecated?: SchemaCommandDeprecated
  examples?: SchemaCommandExample[]
  conditionalArgs?: SchemaCommandConditionalArg[]
}

/** deprecated since バージョン (deprecated verb が追加されたバージョン) */
const D = "v0.10.0"

/**
 * SCHEMA_COMMAND_METADATA はコマンド ID → 付与メタデータのマップ。
 *
 * キーはドット区切りのコマンド ID (例: "page.get", "page.edit.preview")。
 * ルートコマンド "cos" は含まない。
 */
export const SCHEMA_COMMAND_METADATA: Readonly<Record<string, SchemaCommandEnrichment>> = {
  // ---- 読み取り系 (any) ----
  "page.get": {
    requiresAuthKind: "any",
    permissionKind: "read",
    conditionalArgs: [
      { when: { arg: "format", equals: ["code", "table"] }, required: ["filename"] },
    ],
    examples: [
      {
        description: "ページ詳細を JSON で取得",
        command: 'cos page get "ページ名" -p myproj --json --results-only',
      },
      {
        description: "AI エージェント向け Markdown 出力 (メタ + 本文 + リンク先)",
        command: 'cos page get "ページ名" --format=ai -p myproj',
      },
      {
        description: "テキスト形式で取得",
        command: 'cos page get "ページ名" --format=text -p myproj',
      },
      {
        description: "コードブロックを取得",
        command: 'cos page get "ページ名" --format=code --filename=src.ts -p myproj',
      },
      {
        description: "Smart Context (リンク先本文) を取得",
        command: 'cos page get "ページ名" --format=context -p myproj',
      },
    ],
  },
  "page.list": { requiresAuthKind: "any", permissionKind: "read" },
  "page.history": { requiresAuthKind: "any", permissionKind: "read" },
  "page.infobox": { requiresAuthKind: "any", permissionKind: "read" },
  "page.watch": { requiresAuthKind: "any", permissionKind: "read" },
  "page.snapshot": { requiresAuthKind: "any", permissionKind: "read" },
  "page.snapshot.list": { requiresAuthKind: "any", permissionKind: "read" },
  "page.snapshot.get": { requiresAuthKind: "any", permissionKind: "read" },
  "page.line": { requiresAuthKind: "any", permissionKind: "read" },
  "page.line.get": { requiresAuthKind: "any", permissionKind: "read" },
  "project.list": { requiresAuthKind: "any", permissionKind: "read" },
  "project.info": { requiresAuthKind: "any", permissionKind: "read" },
  "project.members": { requiresAuthKind: "any", permissionKind: "read" },
  "project.graph": { requiresAuthKind: "any", permissionKind: "read" },
  "project.stream": { requiresAuthKind: "any", permissionKind: "read" },
  "project.search": { requiresAuthKind: "any", permissionKind: "read" },
  auth: { requiresAuthKind: "none", permissionKind: "config" },
  "auth.whoami": { requiresAuthKind: "any", permissionKind: "read" },
  "auth.list": { requiresAuthKind: "none", permissionKind: "read" },
  "auth.status": { requiresAuthKind: "none", permissionKind: "read" },
  "auth.doctor": { requiresAuthKind: "any", permissionKind: "read" },
  "config.get": { requiresAuthKind: "none", permissionKind: "config" },
  "config.path": { requiresAuthKind: "none", permissionKind: "config" },
  schema: { requiresAuthKind: "none", permissionKind: "meta" },
  "exit-codes": { requiresAuthKind: "none", permissionKind: "meta" },
  notation: { requiresAuthKind: "none", permissionKind: "meta" },
  search: { requiresAuthKind: "any", permissionKind: "read" },
  "sync.diff": { requiresAuthKind: "any", permissionKind: "read" },
  "sync.pull": { requiresAuthKind: "any", permissionKind: "read" },
  "watch-list.list": { requiresAuthKind: "none", permissionKind: "read" },
  convert: { requiresAuthKind: "none", permissionKind: "meta" },

  // ---- deprecated 読み取り verb (any) ----
  "page.text": {
    requiresAuthKind: "any",
    permissionKind: "read",
    canonicalId: "page.get",
    deprecated: { since: D, replacement: "page get --format=text" },
  },
  "page.code": {
    requiresAuthKind: "any",
    permissionKind: "read",
    canonicalId: "page.get",
    deprecated: {
      since: D,
      replacement: "page get <title> --format=code --filename=<filename>",
    },
  },
  "page.table": {
    requiresAuthKind: "any",
    permissionKind: "read",
    canonicalId: "page.get",
    deprecated: {
      since: D,
      replacement: "page get <title> --format=table --filename=<filename>",
    },
  },
  "page.url": {
    requiresAuthKind: "none",
    permissionKind: "read",
    canonicalId: "page.get",
    deprecated: { since: D, replacement: "page get --format=url" },
  },
  "page.icon": {
    requiresAuthKind: "none",
    permissionKind: "read",
    canonicalId: "page.get",
    deprecated: { since: D, replacement: "page get <title> --format=icon" },
  },
  "page.context": {
    requiresAuthKind: "any",
    permissionKind: "read",
    canonicalId: "page.get",
    deprecated: { since: D, replacement: "page get --format=context" },
  },

  // ---- 書き込み系 (PAT 必須) ----
  "page.edit": { requiresAuthKind: "pat", permissionKind: "write" },
  "page.edit.preview": {
    requiresAuthKind: "pat",
    permissionKind: "write",
    examples: [
      {
        description: "末尾に行を追加",
        command: 'cos page edit preview "ページ名" --op=append --text "追加テキスト" -p myproj',
      },
      {
        description: "先頭 (タイトル直後) に挿入",
        command: 'cos page edit preview "ページ名" --op=prepend --text "テキスト" -p myproj',
      },
      {
        description: "指定行の後ろに挿入",
        command:
          'cos page edit preview "ページ名" --op=insert --after 3 --text "テキスト" -p myproj',
      },
      {
        description: "行を置換 (改行禁止)",
        command:
          'cos page edit preview "ページ名" --op=line-replace --line-number 2 --text "新テキスト" -p myproj',
      },
      {
        description: "行を削除",
        command: 'cos page edit preview "ページ名" --op=line-delete --range 3:5 -p myproj',
      },
      {
        description: "新規ページを作成",
        command:
          'cos page edit preview "新ページ名" --op=new-page --text "1行目\\n2行目" -p myproj',
      },
      {
        description: "ops JSON で細かく制御 (行 ID 指定)",
        command:
          'cos page edit preview "ページ名" --op=ops --ops \'{"ops":[{"insertBefore":"_end","text":"末尾追加"}]}\' -p myproj',
      },
    ],
  },
  "page.edit.submit": { requiresAuthKind: "pat", permissionKind: "write" },

  // ---- deprecated 書き込み verb (PAT 必須) ----
  "page.append": { requiresAuthKind: "pat", permissionKind: "write" },
  "page.append.preview": {
    requiresAuthKind: "pat",
    permissionKind: "write",
    canonicalId: "page.edit.preview",
    deprecated: { since: D, replacement: "page edit preview --op=append" },
  },
  "page.prepend": { requiresAuthKind: "pat", permissionKind: "write" },
  "page.prepend.preview": {
    requiresAuthKind: "pat",
    permissionKind: "write",
    canonicalId: "page.edit.preview",
    deprecated: { since: D, replacement: "page edit preview --op=prepend" },
  },
  "page.insert": { requiresAuthKind: "pat", permissionKind: "write" },
  "page.insert.preview": {
    requiresAuthKind: "pat",
    permissionKind: "write",
    canonicalId: "page.edit.preview",
    deprecated: { since: D, replacement: "page edit preview --op=insert" },
  },
  "page.new": { requiresAuthKind: "pat", permissionKind: "write" },
  "page.new.preview": {
    requiresAuthKind: "pat",
    permissionKind: "write",
    canonicalId: "page.edit.preview",
    deprecated: { since: D, replacement: "page edit preview --op=new-page" },
  },
  "page.line.replace": { requiresAuthKind: "pat", permissionKind: "write" },
  "page.line.replace.preview": {
    requiresAuthKind: "pat",
    permissionKind: "write",
    canonicalId: "page.edit.preview",
    deprecated: { since: D, replacement: "page edit preview --op=line-replace" },
  },
  "page.line.delete": { requiresAuthKind: "pat", permissionKind: "write" },
  "page.line.delete.preview": {
    requiresAuthKind: "pat",
    permissionKind: "write",
    canonicalId: "page.edit.preview",
    deprecated: { since: D, replacement: "page edit preview --op=line-delete" },
  },

  // ---- SID 必須 (旧 WebSocket commit) ----
  "page.delete": { requiresAuthKind: "sid", permissionKind: "destructive" },
  "page.rename": { requiresAuthKind: "sid", permissionKind: "destructive" },
  "page.pin": { requiresAuthKind: "sid", permissionKind: "write" },
  "page.unpin": { requiresAuthKind: "sid", permissionKind: "write" },
  "page.update-links": { requiresAuthKind: "sid", permissionKind: "write" },
  "sync.push": { requiresAuthKind: "sid", permissionKind: "write" },

  // ---- 認証変更・設定変更 ----
  "auth.add": { requiresAuthKind: "none", permissionKind: "config" },
  "auth.login": { requiresAuthKind: "none", permissionKind: "config" },
  "auth.logout": { requiresAuthKind: "none", permissionKind: "config" },
  "auth.migrate": { requiresAuthKind: "none", permissionKind: "config" },
  "auth.use": { requiresAuthKind: "none", permissionKind: "config" },
  "config.set": { requiresAuthKind: "none", permissionKind: "config" },
  "watch-list.add": { requiresAuthKind: "none", permissionKind: "config" },
  "watch-list.remove": { requiresAuthKind: "none", permissionKind: "config" },
  serve: { requiresAuthKind: "any", permissionKind: "write" },
  "serve.rest": { requiresAuthKind: "any", permissionKind: "write" },
}
