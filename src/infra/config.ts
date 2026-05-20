/**
 * config.ts — ~/.config/coscli/config.json5 の読み書き。
 *
 * JSON5 形式なのでコメントや末尾カンマが使える。
 * 設定ファイルにはシークレット (connect.sid) を含めない。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import JSON5 from "json5"
import { z } from "zod"

/** PermissionPreset はプロジェクトに適用できる権限プリセット。 */
const PermissionPresetSchema = z.enum(["read", "readwrite", "none"])

/**
 * CommandPatternSchema はコマンドパターン文字列のバリデーションスキーマ。
 * 許容形式: "*" / "all" / "noun" / "noun.verb" / "noun.*" / "noun.noun.verb" 等
 */
const CommandPatternSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z*][a-z0-9.*]*$|^all$/,
    "コマンドパターンは noun.verb 形式、または * / all を指定してください (例: page.list)",
  )

/** ProjectConfig はプロジェクト固有の設定。 */
const ProjectConfigSchema = z.object({
  defaultSort: z.string().optional(),
  defaultLimit: z.number().optional(),
  /**
   * このプロジェクトの権限プリセット。
   * "read": 読み取り系コマンドのみ許可。
   * "readwrite": 全コマンド許可。
   * "none": 全コマンド拒否。
   */
  permission: PermissionPresetSchema.optional(),
  /** このプロジェクトで許可するコマンドリスト (permission より細かい制御が必要な場合)。 */
  enableCommands: z.array(CommandPatternSchema).optional(),
  /** このプロジェクトで禁止するコマンドリスト (permission より細かい制御が必要な場合)。 */
  disableCommands: z.array(CommandPatternSchema).optional(),
})

/** SyncConfig はローカル同期に関する設定。 */
const SyncConfigSchema = z.object({
  dir: z.string().optional(),
  format: z.enum(["txt"]).optional(),
  retries: z.number().int().min(0).optional(),
})

/** CoscliConfig は設定ファイル全体のスキーマ。 */
export const CoscliConfigSchema = z.object({
  defaultProject: z.string().optional(),
  defaultProfile: z.string().optional(),
  /**
   * プロジェクト名をキー、Service Account Access Key を値とするマップ。
   * `cos auth sa add` で登録し `buildRestClient` が自動参照する。
   */
  serviceAccounts: z.record(z.string(), z.string()).optional(),
  /**
   * projects に未列挙のプロジェクトへの既定権限プリセット。
   * プロジェクト指定時のみ適用される (プロジェクト未指定コマンドには無効)。
   * 未設定: 全コマンド許可 (後方互換)。
   */
  defaultPermission: PermissionPresetSchema.optional(),
  /** 全プロジェクト共通の絶対禁止コマンドリスト。CLI フラグで上書き可能。 */
  disableCommands: z.array(CommandPatternSchema).optional(),
  projects: z.record(z.string(), ProjectConfigSchema).optional(),
  output: z
    .object({
      color: z.enum(["auto", "always", "never"]).optional(),
      json: z.boolean().optional(),
      plain: z.boolean().optional(),
    })
    .optional(),
  sync: SyncConfigSchema.optional(),
})
export type CoscliConfig = z.infer<typeof CoscliConfigSchema>

/** defaultConfigPath は OS 規約に従ったデフォルト設定ファイルパスを返す。 */
export function defaultConfigPath(): string {
  const xdgConfig = process.env["XDG_CONFIG_HOME"]
  const base = xdgConfig ?? join(homedir(), ".config")
  return join(base, "coscli", "config.json5")
}

/** loadConfig は設定ファイルを読み込んで検証した Config を返す。 */
export function loadConfig(filePath: string = defaultConfigPath()): CoscliConfig {
  if (!existsSync(filePath)) return {}
  try {
    const raw = readFileSync(filePath, "utf-8")
    const parsed = JSON5.parse(raw) as unknown
    return CoscliConfigSchema.parse(parsed)
  } catch (err) {
    throw new Error(
      `設定ファイルの読み込みに失敗しました: ${filePath}\n${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/** saveConfig は Config を JSON5 ファイルに保存する。 */
export function saveConfig(config: CoscliConfig, filePath: string = defaultConfigPath()): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // JSON5 形式のヘッダコメントを付与
  const header = "// coscli 設定ファイル (JSON5形式 — コメント・末尾カンマ可)\n"
  writeFileSync(filePath, header + JSON.stringify(config, null, 2), { mode: 0o600 })
}

/** FORBIDDEN_KEYS は prototype 汚染を引き起こす危険なキー名の集合。 */
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"])

/**
 * assertSafeKey はキーが安全かどうかを検証する。
 * 危険なキーが含まれている場合は Error を throw する。
 */
function assertSafeKeys(parts: string[]): void {
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) {
      throw new Error(`設定キーに不正な値が含まれています: "${part}"`)
    }
  }
}

/** getConfigValue は設定のネストしたキーを . 区切りで取得する。 */
export function getConfigValue(config: CoscliConfig, key: string): unknown {
  const parts = key.split(".")
  // 禁止キーへのアクセスは undefined を返して prototype 汚染を防ぐ
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) return undefined
  }
  let current: unknown = config
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** setConfigValue は設定のネストしたキーを . 区切りで設定する。 */
export function setConfigValue(config: CoscliConfig, key: string, value: unknown): CoscliConfig {
  const parts = key.split(".")
  // 禁止キーが含まれていれば即座に throw して prototype 汚染を防ぐ
  assertSafeKeys(parts)
  const updated = structuredClone(config) as Record<string, unknown>
  let current = updated
  for (const part of parts.slice(0, -1)) {
    if (typeof current[part] !== "object" || current[part] === null) {
      current[part] = Object.create(null) as Record<string, unknown>
    }
    current = current[part] as Record<string, unknown>
  }
  const lastKey = parts.at(-1)
  if (lastKey !== undefined) {
    current[lastKey] = value
  }
  return CoscliConfigSchema.parse(updated)
}
