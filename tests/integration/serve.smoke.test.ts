/**
 * serve.smoke.test.ts — Bun.serve を実際に起動する統合スモークテスト。
 *
 * port: 0 で起動し OS にポートを自動割り当てさせることで競合を回避する。
 * /healthz に GET してステータス 200 を確認後、サーバを停止する。
 * ネットワーク接続は不要（ローカルループバックのみ）。
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { CosenseRestClient } from "@/core/api/rest"
import type { ScrapboxWriter } from "@/core/api/ws"
import { createPolicy } from "@/core/sandbox"
import { createFetchHandler } from "@/core/server/rest"
import type { ServerContext } from "@/core/server/types"

/** スモークテスト用のダミー ScrapboxWriter。実際の WS 接続は行わない。 */
const dummyWriter: ScrapboxWriter = {
  patch: async () => ({ commitId: "dummy", pageId: "dummy" }),
  insertLines: async () => ({ commitId: "dummy" }),
  deletePage: async () => ({ title: "dummy" }),
  pinPage: async () => ({ title: "dummy" }),
  unpinPage: async () => ({ title: "dummy" }),
}

let server: ReturnType<typeof Bun.serve>
let assignedPort = 0

beforeAll(() => {
  const ctx: ServerContext = {
    restClient: new CosenseRestClient({ sid: "smoke-test-sid" }),
    writer: dummyWriter,
    project: "smoke-test-project",
    policy: createPolicy({}),
    allowWrite: false,
  }

  const fetchHandler = createFetchHandler(ctx)
  // port: 0 で起動すると OS が空きポートを自動割り当てする
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: fetchHandler,
  })
  assignedPort = server.port ?? 0
})

afterAll(() => {
  server.stop(true)
})

describe("Bun.serve スモークテスト", () => {
  it("サーバが起動し /healthz が 200 を返す", async () => {
    const res = await fetch(`http://127.0.0.1:${assignedPort}/healthz`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it("存在しないパスは 404 ROUTE_NOT_FOUND を返す", async () => {
    const res = await fetch(`http://127.0.0.1:${assignedPort}/not-exist`)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("ROUTE_NOT_FOUND")
  })
})
