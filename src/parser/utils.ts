import type { AttrsParseResult } from '../types/document/common.ts'
import type { ColumnAlign, FileGroup } from '../types/document/blocks.ts'

// ─── ID_LITERAL helpers ───────────────────────────────────────────────────────

export function isIdStart(c: string): boolean {
  return /[a-zA-Z0-9]/.test(c)
}

export function isIdChar(c: string): boolean {
  return /[a-zA-Z0-9._-]/.test(c)
}

// ─── List detection ───────────────────────────────────────────────────────────

export function isListMarkerLine(line: string): boolean {
  return /^\d+\. /.test(line) || line.startsWith('- ') || line.startsWith('- [')
}

// ─── Table helpers ────────────────────────────────────────────────────────────

export function isDelimiterRow(line: string): boolean {
  return line.trimStart().startsWith('|') && /\|[\s:]*-{2,}[\s:]*\|/.test(line)
}

export function splitCells(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const parts = inner.split('|')
  if (parts[parts.length - 1]?.trim() === '') parts.pop()
  return parts
}

export function parseColumnAlign(s: string): ColumnAlign {
  if (s.endsWith(',')) return 'comma'
  if (s.endsWith('.')) return 'decimal'
  if (s.startsWith(':') && s.endsWith(':')) return 'center'
  if (s.startsWith(':')) return 'left'
  if (s.endsWith(':')) return 'right'
  return 'left'
}

// ─── File group detection ─────────────────────────────────────────────────────

export function detectFileGroup(src: string): FileGroup | undefined {
  const ext = src.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio'
  return undefined
}

// ─── Input normalisation ──────────────────────────────────────────────────────

/**
 * Normalize raw input into an array of lines ready for block parsing.
 *
 * Steps per spec §2:
 *  1. Strip UTF-8 BOM
 *  2. Replace null bytes with U+FFFD
 *  3. Normalize line endings to \n; ensure trailing \n (spec §2.5)
 *  4. Replace tabs with a single space (outside fences — handled lazily here)
 *  5. Filter comment lines (first non-whitespace char is #)
 */
export function normalize(input: string): string[] {
  let s = input.startsWith('\uFEFF') ? input.slice(1) : input
  s = s.replace(/\0/g, '\uFFFD')
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!s.endsWith('\n')) s += '\n'
  s = s.replace(/\t/g, ' ')
  const raw = s.split('\n')
  return raw.filter((line) => {
    const trimmed = line.trimStart()
    return !trimmed.startsWith('#')
  })
}

// Re-export AttrsParseResult so callers of utils don't need a separate import
export type { AttrsParseResult }
