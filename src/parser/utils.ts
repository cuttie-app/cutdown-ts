import type { AttrsParseResult, ColumnAlign, FileGroup } from '../types/document'

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

/**
 * §4.8: a header separator is a `|` row whose every cell is an alignment
 * pattern — optional `:` prefix, ≥ 3 dashes, optional `:` / `,` / `.` suffix —
 * optionally space-padded. `| - |` placeholder rows fail the 3-dash guard and
 * stay content.
 */
export function isHeaderSeparatorRow(line: string): boolean {
  const t = line.trim()
  if (!t.startsWith('|') || !t.endsWith('|') || t.length < 2) return false
  const cells = t.slice(1, -1).split('|')
  if (cells.length === 0) return false
  return cells.every((c) => /^ *:?-{3,}[:,.]? *$/.test(c))
}

/** Split a `+…+` separator row into column segments (between `+` delimiters) */
export function splitGridSeparator(line: string): string[] {
  const t = line.trimStart()
  const inner = t.startsWith('+') ? t.slice(1) : t
  const parts = inner.split('+')
  if (parts[parts.length - 1]?.trim() === '') parts.pop()
  return parts
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

export interface NormalizedInput {
  lines: string[]
  /** Raw-file UTF-16 code-unit offset of each line's first character (spec §7) */
  lineStarts: number[]
}

/**
 * Interpret raw input as an array of lines ready for block parsing, keeping the
 * raw-file offset of each line so `loc` values index the original text.
 *
 * Interpretive rules per spec §7 (the source text is never rewritten):
 *  1. A leading BOM is skipped (first content offset = 1)
 *  2. `\r\n` and lone `\r` are line terminators
 *  3. U+0000 is treated as U+FFFD; a tab is treated as one space (length-preserving)
 *  4. Document-edge blank lines are skipped by the block phase
 */
export function normalize(input: string): NormalizedInput {
  let pos = input.startsWith('\uFEFF') ? 1 : 0
  const lines: string[] = []
  const lineStarts: number[] = []

  let lineStart = pos
  let buf = ''
  const flush = (nextStart: number) => {
    lines.push(buf)
    lineStarts.push(lineStart)
    buf = ''
    lineStart = nextStart
  }
  while (pos < input.length) {
    const c = input[pos]
    if (c === '\n') {
      flush(pos + 1)
      pos++
    } else if (c === '\r') {
      const skip = input[pos + 1] === '\n' ? 2 : 1
      flush(pos + skip)
      pos += skip
    } else if (c === '\0') {
      buf += '\uFFFD'
      pos++
    } else if (c === '\t') {
      buf += ' '
      pos++
    } else {
      buf += c
      pos++
    }
  }
  if (buf !== '') flush(pos)

  // §7.6: document-edge blank lines are skipped by the block phase
  let start = 0
  while (start < lines.length && (lines[start] ?? '').trim() === '') start++
  let end = lines.length
  while (end > start && (lines[end - 1] ?? '').trim() === '') end--
  return { lines: lines.slice(start, end), lineStarts: lineStarts.slice(start, end) }
}

// Re-export AttrsParseResult so callers of utils don't need a separate import
export type { AttrsParseResult }
