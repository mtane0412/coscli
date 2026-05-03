/**
 * types.ts — HTTP サーバ層の共有型定義。
 *
 * ServerContext はサーバ起動時に 1 度生成され、
 * すべてのルートハンドラが参照する認証・設定情報を保持する。
 */

import type { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import type { Policy } from "@/core/sandbox"
import { z } from "zod"

/** ServerContext はサーバプロセス全体で共有する実行コンテキスト。 */
export interface ServerContext {
  /** Cosense REST API クライアント。認証済み sid を保持する。 */
  restClient: CosenseRestClient
  /** Cosense WS 書き込みクライアント。 */
  writer: ScrapboxWriter
  /** 対象プロジェクト名。起動時に固定され変更不可。 */
  project: string
  /** sandbox ポリシー。起動時の --enable-commands/--disable-commands から生成。 */
  policy: Policy
  /** プロキシ Bearer トークン。設定時のみ Authorization ヘッダ検証を行う。 */
  token?: string
  /** true のとき POST/PUT/DELETE を有効化する。既定は false（読み取り専用）。 */
  allowWrite: boolean
}

/** CreatePageBody は POST /api/pages のリクエストボディスキーマ。 */
export const CreatePageBody = z.object({
  title: z.string().min(1, "title は必須です"),
  lines: z.array(z.string()),
})

/** EditPageBody は PUT /api/pages/:title のリクエストボディスキーマ。 */
export const EditPageBody = z.object({
  lines: z.array(z.string()).min(1, "lines は 1 行以上必要です"),
})

export type CreatePageBodyType = z.infer<typeof CreatePageBody>
export type EditPageBodyType = z.infer<typeof EditPageBody>
