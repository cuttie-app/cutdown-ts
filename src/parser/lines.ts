import type { Loc } from '../types/document'
import { trimWsEnd } from './utils.ts'

// ─── Lines ───────────────────────────────────────────────────────────────────

/**
 * One line of a block scope. A container removes its prefix by slicing, so
 * `off` always maps `s[0]` back to the raw input (§10: one coordinate system).
 */
export interface Line {
  /** Structural text: a tab reads as one space (§10 rule 7), U+0000 as U+FFFD */
  s: string
  /** Raw text, tabs kept — used for opaque fence bodies and comment payloads */
  r: string
  /** Raw-input UTF-16 offset of `s[0]` */
  off: number
  /** §4.6: the line carried a `>` marker of the enclosing quote, so it is never a lazy continuation */
  marked: boolean
}

export const sliceLine = (l: Line, k: number): Line => ({
  s: l.s.slice(k),
  r: l.r.slice(k),
  off: l.off + k,
  marked: l.marked,
})

export const isBlank = (l: Line): boolean => /^[ \t]*$/.test(l.s)

export const indentOf = (l: Line): number => /^[ \t]*/.exec(l.s)![0].length

/** The line without its leading whitespace. */
export const stripIndent = (l: Line): Line => sliceLine(l, indentOf(l))

/**
 * §10 Input Interpretation. The source is never rewritten: a leading BOM is
 * skipped, `\r\n` / `\r` / `\n` end lines, and document-edge blank lines are
 * dropped by the block phase — their text still counts for offsets.
 */
export function splitLines(input: string): Line[] {
  let pos = input.startsWith('\uFEFF') ? 1 : 0
  const lines: Line[] = []
  let start = pos
  const flush = (end: number) => {
    const r = input.slice(start, end).replace(/\0/g, '\uFFFD')
    lines.push({ s: r.replace(/\t/g, ' '), r, off: start, marked: false })
  }
  while (pos < input.length) {
    const c = input.charCodeAt(pos)
    if (c === 10 /* \n */ || c === 13 /* \r */) {
      flush(pos)
      pos += c === 13 && input.charCodeAt(pos + 1) === 10 ? 2 : 1
      start = pos
    } else pos++
  }
  if (start < input.length) flush(input.length)

  let a = 0
  while (a < lines.length && isBlank(lines[a]!)) a++
  let b = lines.length
  while (b > a && isBlank(lines[b - 1]!)) b--
  return lines.slice(a, b)
}

// ─── Line-start escapes (§13.2) ──────────────────────────────────────────────

/**
 * A text line whose block-opener escape must hold before the `##` cut and the
 * inline parser see it. Most §13.2 escapes need nothing here — `\=`, `\-`,
 * `\>`, `\~~~` … are inline escapes too. Three are not: `\###` and `##\#`
 * would leave a `##` behind, `\https://` escapes a non-special letter, and
 * `\2026.` / `2026\.` escape a digit or `.`.
 */
export interface TextLine {
  /** The text the `##` cut and inline parsing read */
  t: string
  /** Raw line, for payloads */
  r: string
  off: number
  /** `t` index → raw index shift for indices past the rewritten prefix */
  delta: number
  prefix: number
}

export function escapeLineStart(l: Line): TextLine {
  const w = indentOf(l)
  const s = l.s.slice(w)
  let head = s
  let delta = 0
  let prefix = 0
  if (/^(\\###|##\\#)/.test(s)) {
    head = '\\#\\#\\#' + s.slice(4)
    delta = 2
    prefix = 6
  } else if (s.startsWith('\\https://')) {
    head = s.slice(1)
    delta = -1
    prefix = 8
  } else {
    const m = /^\\(\d{1,5}\.)(?=[ \t]|$)/.exec(s) ?? /^(\d{1,5})\\(\.)(?=[ \t]|$)/.exec(s)
    if (m) {
      const marker = m.slice(1).join('')
      head = marker + s.slice(m[0].length)
      delta = -1
      prefix = marker.length
    }
  }
  return { t: l.s.slice(0, w) + head, r: l.r, off: l.off, delta, prefix: prefix === 0 ? 0 : w + prefix }
}

/** Map an index of `t` back to a raw offset. */
export const rawOffset = (tl: TextLine, i: number): number => tl.off + (i >= tl.prefix ? i - tl.delta : i)

// ─── The `##` cut (§7.2, §12.1.2 Phase 2) ────────────────────────────────────

/**
 * Index of the line comment `##` in `t`, or -1. Escapes are recognized first,
 * then CodeInline and MathInline spans that close on the line, and quoted
 * attribute values (§14 rows 5–8).
 */
export function findCommentCut(t: string): number {
  const n = t.length
  let k = 0
  while (k < n - 1) {
    const c = t[k]
    if (c === '\\') {
      k += 2
      continue
    }
    if ((c === '`' || c === '$') && t[k + 1] === c) {
      const close = findSpanClose(t, k + 2, c)
      k = close >= 0 ? close + 2 : k + 2
      continue
    }
    if (c === '{' && t[k + 1] !== '{') {
      // Quoted values inside an attribute group hide `##`.
      let j = k + 1
      let inQuote = false
      while (j < n) {
        const d = t[j]
        if (inQuote) {
          if (d === '\\') j++
          else if (d === '"') inQuote = false
        } else if (d === '"') inQuote = true
        else if (d === '}') break
        else if (d === '#' && t[j + 1] === '#') return j
        j++
      }
      // An unclosed group was scanned to the line end, quotes included.
      if (j >= n) return -1
      k = j + 1
      continue
    }
    if (c === '#' && t[k + 1] === '#') return k
    k++
  }
  return -1
}

/** The closing `` `` `` / `$$` of a span on this line (`` \` `` escapes inside CodeInline). */
function findSpanClose(t: string, from: number, c: string): number {
  for (let j = from; j < t.length - 1; j++) {
    if (c === '`' && t[j] === '\\' && t[j + 1] === '`') {
      j++
      continue
    }
    if (t[j] === c && t[j + 1] === c) return j
  }
  return -1
}

export interface Cut {
  /** Line content before the `##`, trailing whitespace dropped */
  content: string
  comment?: { text: string; loc: Loc }
  /** Where `content` starts in raw coordinates */
  tl: TextLine
}

/** Apply the line-start escapes and the `##` cut to one line. */
export function cutLine(l: Line): Cut {
  const tl = escapeLineStart(l)
  const idx = findCommentCut(tl.t)
  if (idx < 0) return { content: trimWsEnd(tl.t), tl }
  let p = idx + 2
  if (tl.t[p] === ' ' || tl.t[p] === '\t') p++
  const rs = rawOffset(tl, p) - l.off
  const text = l.r.slice(rs)
  return {
    content: trimWsEnd(tl.t.slice(0, idx)),
    comment: { text, loc: { start: l.off + rs, end: l.off + l.r.length } },
    tl,
  }
}
