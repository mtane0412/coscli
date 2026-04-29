/**
 * config.ts — ~/.config/coscli/config.json5 の読み書き。
 *
 * JSON5 形式なのでコメントや末尾カンマが使える。
 * 設定ファイルにはシークレット (connect.sid) を含めない。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import JSON5 from "json5"
import { z } from "zod"

/** ProjectConfig はプロジェクト固有の設定。 */
const ProjectConfigSchema = z.object({
  defaultSort: z.string().optional(),
  defaultLimit: z.number().optional(),
})

/** AgentConfig は AI エージェント向けの設定。 */
const AgentConfigSchema = z.object({
  defaultDisableCommands: z.array(z.string()).optional(),
  maxChangesPerCommit: z.number().optional(),
})

/** CoscliConfig は設定ファイル全体のスキーマ。 */
export const CoscliConfigSchema = z.object({
  defaultProject: z.string().optional(),
  defaultProfile: z.string().optional(),
  projects: z.record(z.string(), ProjectConfigSchema).optional(),
  agent: AgentConfigSchema.optional(),
  output: z
    .object({
      color: z.enum(["auto", "always", "never"]).optional(),
      json: z.boolean().optional(),
      plain: z.boolean().optional(),
    })
    .optional(),
})
export type CoscliConfig = z.infer<typeof CoscliConfigSchema>

/** defaultConfigPath は OS 規約に従ったデフォルト設定ファイルパスを返す。 */
export function defaultConfigPath(): string {
  const xdgConfig = process.env["XDG_CONFIG_HOME"]
  const base = xdgConfig ?? join(process.env["HOME"] ?? "~", ".config")
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
  writeFileSync(filePath, header + JSON.stringify(config, null, 2))
}

/** getConfigValue は設定のネストしたキーを . 区切りで取得する。 */
export function getConfigValue(config: CoscliConfig, key: string): unknown {
  const parts = key.split(".")
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
  const updated = structuredClone(config) as Record<string, unknown>
  let current = updated
  for (const part of parts.slice(0, -1)) {
    if (typeof current[part] !== "object" || current[part] === null) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  const lastKey = parts.at(-1)
  if (lastKey !== undefined) {
    current[lastKey] = value
  }
  return CoscliConfigSchema.parse(updated)
}
