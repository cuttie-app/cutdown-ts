import type { Diagnostic, Loc } from '../types/document'

// ─── Character classes (§1.3, §1.4, §2.1) ────────────────────────────────────

/** §1.4 WHITESPACE: space and tab only. */
export const isWs = (c: string | undefined): boolean => c === ' ' || c === '\t'

/**
 * Whitespace trims for §1.4 WHITESPACE. `String.prototype.trim` also strips
 * U+000C, U+00A0, U+3000 and the rest of Unicode White_Space, which Cutdown
 * reads as ordinary text.
 */
export function trimWsEnd(s: string): string {
  let e = s.length
  while (e > 0 && isWs(s[e - 1])) e--
  return e === s.length ? s : s.slice(0, e)
}
export function trimWsStart(s: string): string {
  let a = 0
  while (a < s.length && isWs(s[a])) a++
  return a === 0 ? s : s.slice(a)
}
export const trimWs = (s: string): string => trimWsStart(trimWsEnd(s))

/** §1.3 CONTROL */
export function isControl(c: string): boolean {
  const n = c.codePointAt(0) ?? 0
  return n <= 0x1f || n === 0x7f || (n >= 0x80 && n <= 0x9f)
}

/** §1.4 BIDI_CONTROL: the Unicode Bidi_Control property. */
export function isBidiControl(c: string): boolean {
  const n = c.codePointAt(0) ?? 0
  return n === 0x061c || n === 0x200e || n === 0x200f || (n >= 0x202a && n <= 0x202e) || (n >= 0x2066 && n <= 0x2069)
}

/** §1.4 UNICODE_WHITESPACE */
export function isUnicodeWs(c: string): boolean {
  const n = c.codePointAt(0) ?? 0
  return (
    (n >= 0x9 && n <= 0xd) ||
    n === 0x20 ||
    n === 0x85 ||
    n === 0xa0 ||
    n === 0x1680 ||
    (n >= 0x2000 && n <= 0x200a) ||
    n === 0x2028 ||
    n === 0x2029 ||
    n === 0x202f ||
    n === 0x205f ||
    n === 0x3000
  )
}

/** §2.1 ID_CHAR */
export const isIdChar = (c: string | undefined): boolean => c !== undefined && /^[a-zA-Z0-9._-]$/.test(c)

/** §2.1 ID_NAME */
export const isIdName = (s: string): boolean => /^[a-zA-Z0-9._-]+$/.test(s)

/** §2.1 ID_VALUE */
export function isIdValue(s: string): boolean {
  if (s === '') return false
  for (const c of s) {
    if (isUnicodeWs(c) || c === '#' || c === ')' || c === '}' || isControl(c) || isBidiControl(c)) return false
  }
  return true
}

/** Characters a backslash escapes in inline text (§B, Escapable "Yes"). */
const INLINE_SPECIAL = new Set('=#*_~`$^:"\'->|/\\[]()!{}')

export const isInlineSpecial = (c: string | undefined): boolean => c !== undefined && INLINE_SPECIAL.has(c)

/** Length in Unicode scalar values (§1.3 Units). */
export function scalarLength(s: string): number {
  let n = 0
  for (const _ of s) n++
  return n
}

/** §1.7: a path has the Cutdown extension, matched ASCII case-insensitively. */
export const hasCutdownExtension = (path: string): boolean => path.toLowerCase().endsWith('.cutdown')

// ─── Diagnostics ─────────────────────────────────────────────────────────────

const MESSAGES: Record<string, string> = {
  'CDN-0001': 'Unclosed CodeBlock fence',
  'CDN-0002': 'Unclosed Meta fence',
  'CDN-0003': 'Unclosed MathBlock fence',
  'CDN-0004': 'Unclosed NamedBlock',
  'CDN-0005': 'Unclosed SpoilerBlock fence',
  'CDN-0006': 'Unclosed CommentBlock fence',
  'CDN-0008': 'Orphaned caption line',
  'CDN-0009': 'Attribute block on caption line ignored',
  'CDN-0011': 'Orphaned scope-chain attributes',
  'CDN-0012': 'Heading level out of range',
  'CDN-0013': 'NamedBlock without a valid name',
  'CDN-0014': 'Crossed inline element boundaries',
  'CDN-0015': 'Invalid or empty Variable key',
  'CDN-0016': 'Fence tail dropped',
  'CDN-0017': 'Page separator inside block container',
  'CDN-0018': 'Table row cell count exceeds column count',
  'CDN-0020': 'Duplicate id attribute',
  'CDN-0022': 'Duplicate custom attribute key',
  'CDN-0030': 'Meta block inside block container',
  'CDN-0031': 'Mark nesting depth exceeded',
  'CDN-0032': 'Invalid path',
  'CDN-0033': 'Invalid link target',
  'CDN-0034': 'Class limit exceeded',
  'CDN-0035': 'Value exceeds limit of 2048 chars',
  'CDN-0036': 'Unsupported link form [text][target]; write [text](target)',
  'CDN-0037': 'Invalid id',
  'CDN-0038': 'Invalid language code',
  'CDN-0039': 'Invalid Meta format',
  'CDN-0040': 'Block nesting limit exceeded',
  'CDN-0041': 'Attribute entry limit exceeded',
  'CDN-0042': 'Query pair limit exceeded',
}

/** Every diagnostic is a warning (§17.2); `message` wording is implementation-defined. */
export function diag(code: string, loc?: Loc, detail?: string): Diagnostic {
  const message = (MESSAGES[code] ?? code) + (detail ? ` — ${detail}` : '')
  return loc ? { code, level: 'warning', loc, message } : { code, level: 'warning', message }
}

/** §20.6 limits */
export const LIMITS = {
  blockDepth: 32,
  markDepth: 8,
  attrEntries: 32,
  classes: 32,
  queryPairs: 32,
  valueLength: 2048,
  jsonLength: 4096,
  jsonDepth: 8,
} as const
