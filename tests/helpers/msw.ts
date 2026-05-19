/**
 * msw.ts — msw モックサーバーのライフサイクル管理ヘルパー。
 *
 * bun:test のライフサイクルフックへの自動登録を提供する。
 */

import { afterAll, afterEach, beforeAll } from "bun:test"
import type { RequestHandler } from "msw"
import { setupServer } from "msw/node"

/**
 * useMswServer は msw のモックサーバーを生成し、テストのライフサイクルに自動登録する。
 *
 * - beforeAll でサーバーを起動する
 * - afterEach でハンドラーをリセットする (server.use で追加した動的ハンドラーを破棄)
 * - afterAll でサーバーを停止する
 *
 * テストファイルのトップレベルで呼び出すこと。
 */
export function useMswServer(handlers: RequestHandler[] = []): ReturnType<typeof setupServer> {
  const server = setupServer(...handlers)
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())
  return server
}
