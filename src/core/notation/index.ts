/**
 * notation/index.ts — Cosense 記法ヘルパーのエントリポイント。
 */

export { NOTATION_GUIDE } from "./guide"
export type { NotationGuide, NotationItem, NotationSection } from "./guide"
export { lintNotation } from "./lint"
export type { NotationFinding } from "./lint"
export { normalizeCodeBlockEmptyLines } from "./normalize"
