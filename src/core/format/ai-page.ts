/**
 * ai-page.ts — ページ情報をエージェント向け Markdown に整形するフォーマッター。
 *
 * Page + ProjectMembersResponse から、メタデータ・アイコン・テロメア・本文・
 * 1-hop 関連ページを 1 度に出力する Markdown 文字列を生成する。
 * `cos page get --format ai` 専用。
 */

import { buildTelomere } from "@/core/telomere"
import type { Page } from "@/schemas/page"
import type { ProjectMembersResponse } from "@/schemas/project"

/** unix タイムスタンプ（秒）を "YYYY-MM-DD HH:mm:ss" の JST 文字列に変換する */
function formatTimestamp(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/**
 * formatAiPage は Page と ProjectMembersResponse からエージェント向け Markdown を生成する。
 *
 * @param page - Cosense ページ詳細
 * @param members - プロジェクトメンバー情報。null の場合はユーザーID をそのまま使用する
 */
export function formatAiPage(page: Page, members: ProjectMembersResponse | null): string {
  // userId → { displayName, name } のマップを構築する
  const memberMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  if (members) {
    for (const u of members.users) {
      memberMap.set(u.id, u.displayName)
      nameMap.set(u.id, u.name)
    }
  }

  const lines: string[] = []

  // タイトル
  lines.push(`# ${page.title}`, "")

  // メタデータセクション
  lines.push("## メタデータ", "")
  lines.push("| 項目 | 値 |")
  lines.push("|------|-----|")
  lines.push(`| ID | ${page.id} |`)
  if (page.commitId) lines.push(`| commitId | ${page.commitId} |`)
  lines.push(`| 作成日時 | ${formatTimestamp(page.created)} |`)
  lines.push(`| 最終更新 | ${formatTimestamp(page.updated)} |`)
  if (page.linked !== undefined) lines.push(`| 被リンク数 | ${page.linked} |`)
  if (page.views !== undefined) lines.push(`| views | ${page.views} |`)
  // lines[0] はタイトル行なので除いた行数・文字数を計算する
  const bodyLines = page.lines.slice(1)
  lines.push(`| 行数 | ${bodyLines.length} |`)
  const charCount = bodyLines.reduce((sum, l) => sum + l.text.length, 0)
  lines.push(`| 文字数 | ${charCount} |`)
  if (page.user) {
    const creatorName = memberMap.get(page.user.id) ?? page.user.displayName ?? page.user.id
    lines.push(`| 作成者 | ${creatorName} |`)
  }
  lines.push("")

  // テロメア集計（lines[0] タイトル行は除外）
  const telomere = buildTelomere(bodyLines, memberMap)

  // 編集メンバーセクション（テロメアに登場したユーザーのアイコン記法）
  if (telomere.length > 0) {
    lines.push("## 編集メンバー", "")
    const icons = telomere
      .map(({ userId }) => {
        const name = nameMap.get(userId) ?? userId
        return `[${name}.icon]`
      })
      .join(" ")
    lines.push(icons, "")
  }

  // テロメアセクション
  if (telomere.length > 0) {
    lines.push("## テロメア", "")
    lines.push("| 更新者 | 行数 | 最終更新 |")
    lines.push("|--------|------|----------|")
    for (const entry of telomere) {
      lines.push(
        `| ${entry.displayName} | ${entry.lineCount} | ${formatTimestamp(entry.latestUpdated)} |`,
      )
    }
    lines.push("")
  }

  // 本文セクション（lines[0] タイトル行を除く）
  lines.push("## 本文", "")
  for (const line of bodyLines) {
    lines.push(line.text)
  }
  lines.push("")

  // 1-hop 関連ページセクション
  const links1hop = page.relatedPages?.links1hop
  if (links1hop && links1hop.length > 0) {
    lines.push("---", "")
    lines.push("## 関連ページ（1-hop）", "")
    for (const rel of links1hop) {
      lines.push(`- ${rel.title}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}
