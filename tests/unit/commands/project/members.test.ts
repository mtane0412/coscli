/**
 * project/members.test.ts — `cos project members` コマンドのテスト。
 *
 * DI (deps) を使って REST クライアントをモック注入し、
 * 正常系・エラー系・sandbox 違反・バリデーションを検証する。
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import {
  type ProjectMembersDeps,
  type ProjectMembersRestClient,
  makeProjectMembersCommand,
} from "@/commands/project/members"
import { AuthError, ForbiddenError, NotFoundError } from "@/core/api/rest"
import type { ProjectMembersResponse } from "@/schemas/project"

// ----- モックデータ -----

/** 基本 ProjectMembersResponse */
const mockMembersResponse: ProjectMembersResponse = {
  users: [
    {
      id: "ユーザーID-001",
      name: "yamada-taro",
      displayName: "山田太郎",
      email: "yamada@example.co.jp",
      provider: "google",
      created: 1700000000,
      updated: 1700100000,
    },
    {
      id: "ユーザーID-002",
      name: "suzuki-hanako",
      displayName: "鈴木花子",
      email: "suzuki@example.co.jp",
      provider: "github",
      created: 1700050000,
      updated: 1700150000,
    },
  ],
  memberSnapshots: [
    {
      id: "スナップショットID-001",
      reason: "left",
      created: 1699000000,
      updated: 1699100000,
      data: { displayName: "退去ユーザー", name: "retired-user" },
    },
  ],
}

/** メンバーなし・スナップショットなしの空レスポンス */
const mockEmptyResponse: ProjectMembersResponse = {
  users: [],
  memberSnapshots: [],
}

// ----- モックファクトリ -----

/** createMockRestClient はモック REST クライアントを生成する。 */
function createMockRestClient(
  response: ProjectMembersResponse = mockMembersResponse,
  opts: { throwError?: Error } = {},
): ProjectMembersRestClient {
  return {
    async getProjectMembers() {
      if (opts.throwError) throw opts.throwError
      return response
    },
  }
}

/** plainArgs はプレーンテキスト出力を期待するテストで使う基本引数。 */
const plainArgs: Record<string, unknown> = {
  name: "テストプロジェクト",
  project: undefined,
  json: false,
  plain: true,
  "results-only": false,
  select: undefined,
  "enable-commands": undefined,
  "disable-commands": undefined,
  verbose: undefined,
  quiet: false,
  profile: undefined,
}

/** jsonArgs は JSON 出力を期待するテストで使う基本引数。 */
const jsonArgs: Record<string, unknown> = {
  ...plainArgs,
  json: true,
  plain: false,
}

/** defaultArgs は後方互換のエイリアス (バリデーション系テストで使用)。 */
const defaultArgs = plainArgs

/** createMockDeps はモック依存を生成する。個別フィールドを上書き可能。 */
function createMockDeps(overrides: Partial<ProjectMembersDeps> = {}): ProjectMembersDeps {
  return {
    restClient: createMockRestClient(),
    ...overrides,
  }
}

/** runMembers は makeProjectMembersCommand の run を呼び出すヘルパー。 */
async function runMembers(args: Record<string, unknown>, deps?: ProjectMembersDeps): Promise<void> {
  const cmd = makeProjectMembersCommand(deps)
  await (cmd.run as (ctx: { args: unknown; cmd: never; rawArgs: string[] }) => Promise<void>)({
    args,
    cmd: {} as never,
    rawArgs: [],
  })
}

/** process.exit のモック後に継続実行で throw される例外を握り潰してコマンドを実行する */
async function runAndIgnoreExit(
  args: Record<string, unknown>,
  deps?: ProjectMembersDeps,
): Promise<void> {
  try {
    await runMembers(args, deps)
  } catch (err) {
    // process.exit モック後に exitWithError が throw する Error のみ無視する
    // exitWithError は process.exit 直後に throw new Error(code) を呼ぶため、
    // 既知の終了コード文字列を持つ Error は想定内として握り潰す
    const knownExitCodes = [
      "PROJECT_REQUIRED",
      "POLICY_DENIED",
      "AUTH_ERROR",
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION_ERROR",
    ]
    if (err instanceof Error && knownExitCodes.some((c) => err.message.includes(c))) return
    throw err
  }
}

// ----- セットアップ -----

let exitMock: ReturnType<typeof spyOn>
let stdoutMock: ReturnType<typeof spyOn>
const writtenChunks: string[] = []

beforeEach(() => {
  writtenChunks.length = 0
  exitMock = spyOn(process, "exit").mockImplementation((() => {}) as () => never)
  stdoutMock = spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writtenChunks.push(String(chunk))
    return true
  })
  Reflect.deleteProperty(process.env, "COS_PROJECT")
  Reflect.deleteProperty(process.env, "COS_ENABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_DISABLE_COMMANDS")
  Reflect.deleteProperty(process.env, "COS_SID")
})

afterEach(() => {
  exitMock.mockRestore()
  stdoutMock.mockRestore()
})

/** captureStdout は書き出された全出力を結合して返す。 */
function captureStdout(): string {
  return writtenChunks.join("")
}

// ----- テスト -----

describe("makeProjectMembersCommand", () => {
  describe("バリデーション", () => {
    it("プロジェクト名未指定 (name も --project も環境変数もなし) の場合は exit 5 で終了する", async () => {
      await runAndIgnoreExit(
        { ...defaultArgs, name: undefined, project: undefined },
        createMockDeps(),
      )
      expect(exitMock).toHaveBeenCalledWith(5)
    })

    it("COS_PROJECT 環境変数でプロジェクト名を指定できる", async () => {
      process.env["COS_PROJECT"] = "テストプロジェクト"
      await runAndIgnoreExit({ ...defaultArgs, name: undefined }, createMockDeps())
      // exit 5 (PROJECT_REQUIRED) は呼ばれない
      expect(exitMock).not.toHaveBeenCalledWith(5)
    })

    it("--project フラグは COS_PROJECT 環境変数より優先される", async () => {
      process.env["COS_PROJECT"] = "env-project"
      let capturedProject: string | undefined
      const deps = createMockDeps({
        restClient: {
          async getProjectMembers(project) {
            capturedProject = project
            return mockMembersResponse
          },
        },
      })
      await runAndIgnoreExit({ ...plainArgs, name: undefined, project: "cli-project" }, deps)
      expect(capturedProject).toBe("cli-project")
    })
  })

  describe("sandbox 違反", () => {
    it("--disable-commands=project.members の場合は exit 7 で終了する", async () => {
      await runAndIgnoreExit(
        { ...defaultArgs, "disable-commands": "project.members" },
        createMockDeps(),
      )
      expect(exitMock).toHaveBeenCalledWith(7)
    })
  })

  describe("正常系 (プレーンテキスト出力)", () => {
    it("--plain でメンバー情報を含む整列テキストを出力する", async () => {
      await runAndIgnoreExit(plainArgs, createMockDeps())

      const out = captureStdout()
      expect(out).toContain("山田太郎")
      expect(out).toContain("suzuki-hanako")
    })

    it("--plain で退去済みメンバー (memberSnapshots) も出力する", async () => {
      await runAndIgnoreExit(plainArgs, createMockDeps())

      const out = captureStdout()
      // memberSnapshots にある退去ユーザーが出力に含まれること
      expect(out).toContain("退去")
    })

    it("メンバーが0件・スナップショットも0件の場合は何も出力しない", async () => {
      await runAndIgnoreExit(
        plainArgs,
        createMockDeps({ restClient: createMockRestClient(mockEmptyResponse) }),
      )

      const out = captureStdout()
      // エラーなしで完了し、出力は空か見出しのみ
      expect(exitMock).not.toHaveBeenCalledWith(2)
      expect(exitMock).not.toHaveBeenCalledWith(4)
      expect(out).not.toContain("山田太郎")
    })
  })

  describe("正常系 (JSON 出力)", () => {
    it("--json の場合は envelope 形式で users/memberSnapshots を含む JSON を出力する", async () => {
      await runAndIgnoreExit(jsonArgs, createMockDeps())

      const out = captureStdout()
      const parsed = JSON.parse(out) as {
        data: ProjectMembersResponse
        meta: { command: string }
      }
      expect(parsed.meta.command).toBe("project.members")
      expect(Array.isArray(parsed.data.users)).toBe(true)
      expect(parsed.data.users).toHaveLength(2)
      expect(parsed.data.users[0]?.displayName).toBe("山田太郎")
      expect(Array.isArray(parsed.data.memberSnapshots)).toBe(true)
    })

    it("--results-only の場合は data のみ出力する (meta なし)", async () => {
      await runAndIgnoreExit({ ...jsonArgs, "results-only": true }, createMockDeps())

      const out = captureStdout()
      const parsed = JSON.parse(out) as ProjectMembersResponse
      expect(Array.isArray(parsed.users)).toBe(true)
      expect("meta" in parsed).toBe(false)
    })

    it("--select=users[].name の場合は name 配列のみ出力する", async () => {
      await runAndIgnoreExit(
        {
          ...jsonArgs,
          "results-only": true,
          select: "users[].name",
        },
        createMockDeps(),
      )

      const out = captureStdout()
      const parsed = JSON.parse(out) as string[]
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toContain("yamada-taro")
      expect(parsed).toContain("suzuki-hanako")
    })
  })

  describe("エラー系", () => {
    it("NotFoundError の場合は exit 4 で終了する", async () => {
      const deps = createMockDeps({
        restClient: createMockRestClient(mockMembersResponse, {
          throwError: new NotFoundError("/api/projects/存在しないプロジェクト/users"),
        }),
      })
      await runAndIgnoreExit(defaultArgs, deps)
      expect(exitMock).toHaveBeenCalledWith(4)
    })

    it("AuthError の場合は exit 2 で終了する", async () => {
      const deps = createMockDeps({
        restClient: createMockRestClient(mockMembersResponse, {
          throwError: new AuthError(),
        }),
      })
      await runAndIgnoreExit(defaultArgs, deps)
      expect(exitMock).toHaveBeenCalledWith(2)
    })

    it("ForbiddenError の場合は exit 3 で終了する", async () => {
      const deps = createMockDeps({
        restClient: createMockRestClient(mockMembersResponse, {
          throwError: new ForbiddenError(),
        }),
      })
      await runAndIgnoreExit(defaultArgs, deps)
      expect(exitMock).toHaveBeenCalledWith(3)
    })
  })
})
