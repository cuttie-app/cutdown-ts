import type { Attribute, Diagnostic, Inline, Link, LinkKind, Text } from '../types/document'
import { mergeAttrs, scanAttrGroup } from './attrs.ts'
import { normalizePath, readLocator } from './locator.ts'
import {
  LIMITS,
  diag,
  hasCutdownExtension,
  isBidiControl,
  isControl,
  isIdChar,
  isIdName,
  isIdValue,
  isInlineSpecial,
  scalarLength,
  trimWsEnd,
} from './utils.ts'

/**
 * How the trailing `{…}` groups of an inline context are handled:
 *  - `block`   — returned for the block's scope chain (Rule B, §6.1.2); a group
 *                glued to an inline still binds to that inline
 *  - `heading` — returned whole: the last group is claimed by the Section
 *  - `nested`  — span content, link text, alt, a sealed table cell: the only
 *                slot is the last attr-bearing inline
 *  - `caption` — literal text with CDN-0009 (§6.2)
 */
export type InlineMode = 'block' | 'heading' | 'nested' | 'caption'

export interface InlineResult {
  nodes: Inline[]
  /** Trailing scope-chain groups, left to right (block and heading modes) */
  trailing: Attribute[][]
}

interface Ctx {
  /** Inside link text: `[…](…)` is literal (§5.5) */
  inLink: boolean
  /** Inside `alt`: no link and no image (§5.9) */
  inAlt: boolean
  markDepth: number
}

interface Group {
  group: true
  attrs: Attribute[]
  diagnostics: Diagnostic[]
  raw: string
  glued: boolean
}

type Item = Inline | Group

const SPAN_DELIMS: Record<string, 'Strong' | 'Emphasis' | 'Highlight' | 'Spoiler' | 'double' | 'single'> = {
  '**': 'Strong',
  __: 'Emphasis',
  '~~': 'Highlight',
  '^^': 'Spoiler',
  '""': 'double',
  "''": 'single',
}

const isGroup = (it: Item): it is Group => (it as Group).group === true
const isText = (it: Item): it is Text => !isGroup(it) && it._type === 'Text'
const isWsText = (it: Item): boolean => isText(it) && /^[ \t]*$/.test(it.value)

/** An inline that carries `attributes` (§A.3): everything but Text and LineBreak. */
export const isAttrBearing = (n: unknown): n is Inline & { attributes: Attribute[] } =>
  typeof n === 'object' && n !== null && 'attributes' in n && (n as Inline)._type !== 'Text'

const isSoftWs = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n'

/**
 * Parse one inline context (§12.1.4). `src` holds the context's lines joined
 * by `\n`, each a soft break that adds no character (§15.1); the base-column
 * fold has already been applied.
 */
export function parseInline(src: string, mode: InlineMode, diagnostics: Diagnostic[], markDepth = 0): InlineResult {
  const p = new InlineParser(src, diagnostics)
  const { nodes, trailing } = p.parseRange(0, src.length, { inLink: false, inAlt: false, markDepth }, mode)
  return { nodes, trailing }
}

/** §5.5 wiki link: the text a reader sees. */
export function plainText(nodes: Inline[]): string {
  let out = ''
  for (const n of nodes) {
    switch (n._type) {
      case 'Text':
      case 'CodeInline':
        out += n.value
        break
      case 'MathInline':
        out += n.formula
        break
      case 'Variable':
        out += `{{${n.key}}}`
        break
      case 'ImageInline':
      case 'EmbedImageInline':
        out += plainText(n.alt)
        break
      case 'LineBreak':
        break
      default:
        out += plainText(n.children)
    }
  }
  return out
}

/**
 * Rule B (§6.1.2): the last group claims the first slot, each earlier group the
 * next one. An `Inline[]` slot is its last attr-bearing inline. Groups left
 * without a slot are dropped with one CDN-0011.
 */
export type Slot = { attributes: Attribute[] } | Inline[]

export function distribute(groups: Attribute[][], slots: Slot[], diagnostics: Diagnostic[]): void {
  let orphan = false
  for (let g = groups.length - 1, si = 0; g >= 0; g--, si++) {
    const slot = slots[si]
    const target = Array.isArray(slot) ? lastAttrBearing(slot) : slot
    if (!target) {
      orphan = true
      continue
    }
    target.attributes = mergeAttrs(target.attributes, groups[g]!)
  }
  if (orphan) diagnostics.push(diag('CDN-0011'))
}

function lastAttrBearing(nodes: Inline[]): { attributes: Attribute[] } | null {
  const last = nodes[nodes.length - 1]
  return last && isAttrBearing(last) ? last : null
}

class InlineParser {
  constructor(
    readonly s: string,
    readonly diagnostics: Diagnostic[]
  ) {}

  /** End of the line holding `i`, bounded by `to`. */
  private lineEnd(i: number, to: number): number {
    const nl = this.s.indexOf('\n', i)
    return nl < 0 || nl > to ? to : nl
  }

  /** `[from, to)` with leading and trailing whitespace removed (§15.2). */
  private trim(from: number, to: number): [number, number] {
    while (from < to && isSoftWs(this.s[from])) from++
    while (to > from && isSoftWs(this.s[to - 1])) to--
    return [from, to]
  }

  /**
   * Pairings computed once per context, so no opener rescans the text it
   * cannot close over — parsing stays linear (§12 guarantee 1, §20.2 clause 7).
   */
  private tables?: { tick: Int32Array; dollar: Int32Array; bracket: Int32Array; paren: Int32Array; mark: Int32Array }

  private get t() {
    return (this.tables ??= this.index())
  }

  private index() {
    const s = this.s
    const n = s.length
    // Next `` `` `` / `$$` pair at or after each index; `` \` `` escapes a backtick (§13.3).
    const tick = new Int32Array(n + 1).fill(-1)
    const dollar = new Int32Array(n + 1).fill(-1)
    for (let k = n - 2; k >= 0; k--) {
      tick[k] = s[k] === '`' && s[k + 1] === '`' && s[k - 1] !== '\\' ? k : tick[k + 1]!
      dollar[k] = s[k] === '$' && s[k + 1] === '$' ? k : dollar[k + 1]!
    }
    this.tables = {
      tick,
      dollar,
      bracket: new Int32Array(n).fill(-1),
      paren: new Int32Array(n).fill(-1),
      mark: new Int32Array(n).fill(-1),
    }
    const { bracket, paren, mark } = this.tables
    const brackets: number[] = []
    const marks: number[] = []
    for (let k = 0; k < n; ) {
      const skip = this.skipProtected(k, n)
      if (skip >= 0) {
        k = skip
        continue
      }
      const c = s[k]
      if (c === '[') brackets.push(k)
      else if (c === ']') {
        const o = brackets.pop()
        if (o !== undefined) bracket[o] = k
      } else if (c === ':' && s[k + 1] === ':') {
        // §5.10: `::` + ID_NAME + separator or `::` opens; any other `::` closes.
        let e = k + 2
        while (e < n && isIdChar(s[e])) e++
        if (e > k + 2 && (e >= n || isSoftWs(s[e]) || (s[e] === ':' && s[e + 1] === ':'))) {
          marks.push(k)
          k = e
          continue
        }
        const o = marks.pop()
        if (o !== undefined) mark[o] = k
        k += 2
        continue
      }
      k++
    }
    // §8.1 targets count parentheses with escapes only.
    const parens: number[] = []
    for (let k = 0; k < n; k++) {
      const c = s[k]
      if (c === '\\') k++
      else if (c === '(') parens.push(k)
      else if (c === ')') {
        const o = parens.pop()
        if (o !== undefined) paren[o] = k
      }
    }
    return this.tables
  }

  /**
   * Index of the closing `` `` `` / `$$` of a span opened before `from`, or -1.
   * Inside CodeInline, `` \` `` is an escape; MathInline has none (§13.3).
   */
  private literalClose(from: number, to: number, c: '`' | '$'): number {
    const k = (c === '`' ? this.t.tick : this.t.dollar)[from] ?? -1
    return k >= 0 && k + 1 < to ? k : -1
  }

  /** Next index at or after `from` where `pat` (one or two characters) occurs, or -1. */
  private nextOf(pat: string, from: number): number {
    let table = this.occurrences.get(pat)
    if (!table) {
      const s = this.s
      table = new Int32Array(s.length + 1).fill(-1)
      for (let k = s.length - 1; k >= 0; k--) table[k] = s.startsWith(pat, k) ? k : table[k + 1]!
      this.occurrences.set(pat, table)
    }
    return table[from] ?? -1
  }

  private readonly occurrences = new Map<string, Int32Array>()

  /**
   * Skip an escape or a closed CodeInline/MathInline span at `j` — both rank
   * above every delimiter they could contain (§14). Returns the next index to
   * scan, or -1 when nothing is skipped.
   */
  private skipProtected(j: number, to: number): number {
    const s = this.s
    if (s[j] === '\\') return j + 2
    if ((s[j] === '`' || s[j] === '$') && s[j + 1] === s[j] && j + 1 < to) {
      const close = this.literalClose(j + 2, to, s[j] as '`' | '$')
      return close >= 0 ? close + 2 : j + 2
    }
    return -1
  }

  /**
   * The closer of a span opened before `from`, in source order; -1 if none.
   *
   * A complete link or image is its own inline context, so a closer after it
   * is preferred to one inside it. Only when none follows does the first
   * closer win, crossing the link (§14 row 9, CDN-0014).
   */
  private findDelim(delim: string, from: number, to: number, ctx: Ctx): number {
    const outside = this.scanDelim(delim, from, to, ctx)
    return outside >= 0 ? outside : this.scanDelim(delim, from, to, null)
  }

  private scanDelim(delim: string, from: number, to: number, skipLinks: Ctx | null): number {
    const s = this.s
    let j = from
    while (j + 1 < to) {
      if (s[j] === delim[0] && s[j + 1] === delim[1]) return j
      if (skipLinks) {
        const end = this.completeLink(j, to, skipLinks)
        if (end >= 0) {
          j = end
          continue
        }
      }
      const k = this.skipProtected(j, to)
      j = k >= 0 ? k : j + 1
    }
    return -1
  }

  /** Index after a complete `[…](…)` or `![…](…)` starting at `j`, or -1. */
  private completeLink(j: number, to: number, ctx: Ctx): number {
    const s = this.s
    const image = s[j] === '!' && s[j + 1] === '['
    if (image ? ctx.inAlt : s[j] !== '[' || ctx.inLink || ctx.inAlt) return -1
    const close = this.findBracketClose(image ? j + 2 : j + 1, to)
    if (close < 0 || s[close + 1] !== '(' || close + 1 >= to) return -1
    const end = this.findParenClose(close + 2, to)
    return end < 0 ? -1 : end + 1
  }

  /** The `]` matching the `[` before `from`: brackets counted, escapes not. */
  private findBracketClose(from: number, to: number): number {
    const k = this.t.bracket[from - 1] ?? -1
    return k >= 0 && k < to ? k : -1
  }

  /** §8.1 the first unbalanced `)` after `from`; parentheses nest, escapes do not count. */
  private findParenClose(from: number, to: number): number {
    const k = this.t.paren[from - 1] ?? -1
    return k >= 0 && k < to ? k : -1
  }

  /**
   * §5.10 Class 3: the `::` closing the Mark opened at `open`, found by
   * counting nested openers; -1 if it never closes before `to`.
   */
  private findMarkClose(open: number, to: number): number {
    const k = this.t.mark[open] ?? -1
    return k >= 0 && k + 1 < to ? k : -1
  }

  parseRange(from: number, to: number, ctx: Ctx, mode: InlineMode): InlineResult & { degraded: string[] } {
    const s = this.s
    const items: Item[] = []
    const degraded: string[] = []
    let text = ''
    /** Index right after the last inline node, for `{…}` glue */
    let nodeEnd = -1

    const flush = () => {
      if (text !== '') items.push({ _type: 'Text', value: text })
      text = ''
    }
    const push = (node: Inline, end: number) => {
      flush()
      items.push(node)
      nodeEnd = end
    }
    const slice = (start: number) => {
      const end = this.lineEnd(start, to)
      text += s.slice(start, end)
      return end
    }

    let i = from
    while (i < to) {
      const c = s[i]!
      const n = i + 1 < to ? s[i + 1] : undefined

      if (c === '\n') {
        i++
        continue
      }

      if (c === '\\') {
        if (n === '\n') {
          push({ _type: 'LineBreak' }, i + 2)
          nodeEnd = -1
          i += 2
        } else if (isInlineSpecial(n)) {
          text += n
          i += 2
        } else {
          text += '\\'
          i++
        }
        continue
      }

      // ── CodeInline / MathInline (§5.6, §5.7) ──────────────────────────────
      if ((c === '`' || c === '$') && n === c) {
        const close = this.literalClose(i + 2, to, c)
        if (close < 0) {
          text += c + c
          i += 2
          continue
        }
        let body = s.slice(i + 2, close).replace(/\n/g, '')
        if (c === '`') {
          body = body.replace(/\\`/g, '`')
          push({ _type: 'CodeInline', value: body, attributes: [] }, close + 2)
        } else push({ _type: 'MathInline', formula: body, attributes: [] }, close + 2)
        i = close + 2
        continue
      }

      // ── Class 1 spans (§5.2–§5.4, §5.8, §5.12) ────────────────────────────
      const pair = c + (n ?? '')
      const spanKind = SPAN_DELIMS[pair]
      if (spanKind) {
        const close = this.findDelim(pair, i + 2, to, ctx)
        if (close < 0) {
          text += pair
          degraded.push(pair)
          i += 2
          continue
        }
        const [a, b] = this.trim(i + 2, close)
        const inner = this.parseRange(a, b, ctx, 'nested')
        this.crossCheck(inner.degraded, pair, close + 2)
        const children = inner.nodes
        const node: Inline =
          spanKind === 'double' || spanKind === 'single'
            ? { _type: 'QuoteInline', kind: spanKind, children, attributes: [] }
            : { _type: spanKind, children, attributes: [] }
        push(node, close + 2)
        i = close + 2
        continue
      }

      // ── Links and images (§5.5, §5.9) ─────────────────────────────────────
      const isImage = c === '!' && n === '['
      if ((isImage && !ctx.inAlt) || (c === '[' && !ctx.inLink && !ctx.inAlt)) {
        const open = isImage ? i + 2 : i + 1
        const close = this.findBracketClose(open, to)
        if (close < 0) {
          i = slice(i)
          degraded.push('[')
          continue
        }
        if (s[close + 1] === '[' && close + 1 < to) {
          // §5.5 unsupported form `[text][target]`
          const end = this.findBracketClose(close + 2, this.lineEnd(close + 2, to))
          if (end >= 0) {
            text += s.slice(i, end + 1).replace(/\n/g, '')
            this.diagnostics.push(diag('CDN-0036'))
            i = end + 1
            continue
          }
        }
        if (s[close + 1] !== '(' || close + 1 >= to) {
          i = slice(i)
          degraded.push('[')
          continue
        }
        const targetEnd = this.findParenClose(close + 2, to)
        if (targetEnd < 0) {
          i = slice(i)
          degraded.push('[')
          continue
        }
        const [a, b] = this.trim(open, close)
        const inner = this.parseRange(
          a,
          b,
          { inLink: ctx.inLink || !isImage, inAlt: ctx.inAlt || isImage, markDepth: ctx.markDepth },
          'nested'
        )
        if (!isImage) this.crossCheck(inner.degraded, '[', targetEnd + 1)
        const written = s.slice(close + 2, targetEnd)
        push(isImage ? this.image(inner.nodes, written) : this.link(inner.nodes, written), targetEnd + 1)
        i = targetEnd + 1
        continue
      }

      // ── Mark (§5.10) ──────────────────────────────────────────────────────
      if (c === ':' && n === ':') {
        let j = i + 2
        while (j < to && isIdChar(s[j])) j++
        const name = s.slice(i + 2, j)
        if (name === '') {
          text += '::'
          i += 2
          continue
        }
        const empty = s[j] === ':' && s[j + 1] === ':' && j + 1 < to
        const container = j >= to || isSoftWs(s[j])
        if (!empty && !container) {
          text += '::' + name
          i = j
          continue
        }
        if (ctx.markDepth + 1 > LIMITS.markDepth) {
          this.diagnostics.push(diag('CDN-0031'))
          text += '::' + name
          i = j
          continue
        }
        if (empty) {
          push({ _type: 'Mark', name, children: [], attributes: [] }, j + 2)
          i = j + 2
          continue
        }
        const contentStart = j < to ? j + 1 : j
        const close = this.findMarkClose(i, to)
        if (close < 0) {
          text += '::' + name
          i = j
          continue
        }
        const [a, b] = this.trim(contentStart, close)
        const inner = this.parseRange(a, b, { ...ctx, markDepth: ctx.markDepth + 1 }, 'nested')
        push({ _type: 'Mark', name, children: inner.nodes, attributes: [] }, close + 2)
        i = close + 2
        continue
      }

      // ── Variable (§5.11) ──────────────────────────────────────────────────
      if (c === '{' && n === '{') {
        const end = this.lineEnd(i, to)
        const close = s.indexOf('}}', i + 2)
        if (close < 0 || close + 1 >= end) {
          i = slice(i)
          continue
        }
        const key = s.slice(i + 2, close)
        if (isIdName(key)) push({ _type: 'Variable', key, attributes: [] }, close + 2)
        else {
          if (key !== '') this.diagnostics.push(diag('CDN-0015', undefined, key))
          text += s.slice(i, close + 2)
        }
        i = close + 2
        continue
      }

      // ── Attribute group (§6.1) ────────────────────────────────────────────
      if (c === '{') {
        const r = scanAttrGroup(s, i, to)
        if (!r.ok) {
          text += s.slice(i, r.sliceEnd).replace(/\n/g, '')
          i = r.sliceEnd
          continue
        }
        const glued = nodeEnd === i && text === ''
        flush()
        items.push({
          group: true,
          attrs: r.attrs,
          diagnostics: r.diagnostics,
          raw: s.slice(i, r.end).replace(/\n/g, ''),
          glued,
        })
        nodeEnd = -1
        i = r.end
        continue
      }

      text += c
      i++
    }
    flush()
    return { ...this.finish(items, mode), degraded }
  }

  /**
   * CDN-0014: a span or link closed while an opener of another kind inside it
   * was left literal, and that opener's closer comes later in the context.
   */
  private crossCheck(inner: string[], own: string, after: number): void {
    for (const d of inner) {
      if (d === own) continue
      if (this.nextOf(d === '[' ? ']' : d, after) >= 0) {
        this.diagnostics.push(diag('CDN-0014', undefined, `"${own}" closes while "${d}" is open`))
        return
      }
    }
  }

  /** Resolve `{…}` groups: inline attachment, the trailing chain, or literal text. */
  private finish(items: Item[], mode: InlineMode): InlineResult {
    // The trailing run: groups at the end, whitespace between them allowed.
    let k = items.length - 1
    const run: number[] = []
    while (k >= 0) {
      const it = items[k]!
      if (isGroup(it)) run.unshift(k)
      else if (!isWsText(it)) break
      k--
    }
    // A group glued to an inline binds to it, except on a heading (last-attr rule).
    if (mode !== 'heading' && run.length > 0 && (items[run[0]!] as Group).glued) run.shift()
    // §6.1.3: a context holding nothing but groups has no segment to claim them.
    if (mode === 'block' && items.every((it) => isGroup(it) || isWsText(it))) run.length = 0
    const runStart = run.length > 0 ? run[0]! : items.length

    const out: Item[] = []
    for (let idx = 0; idx < runStart; idx++) {
      const it = items[idx]!
      if (!isGroup(it)) {
        out.push(it)
        continue
      }
      // Mid-context group: binds to the inline right before it, or is literal.
      let p = out.length - 1
      while (p >= 0 && isWsText(out[p]!)) p--
      const prev = out[p]
      if (prev && isAttrBearing(prev)) {
        out.length = p + 1
        prev.attributes = mergeAttrs(prev.attributes, it.attrs)
        this.diagnostics.push(...it.diagnostics)
      } else out.push({ _type: 'Text', value: it.raw })
    }

    const trailing: Attribute[][] = []
    if (run.length > 0) {
      const groups = run.map((idx) => items[idx] as Group)
      if (mode === 'caption') {
        this.diagnostics.push(diag('CDN-0009'))
        for (let idx = runStart; idx < items.length; idx++) {
          const it = items[idx]!
          out.push(isGroup(it) ? { _type: 'Text', value: it.raw } : it)
        }
      } else {
        for (const g of groups) {
          this.diagnostics.push(...g.diagnostics)
          trailing.push(g.attrs)
        }
        // Whitespace before a consumed group is consumed with it (§15.1).
        while (out.length > 0 && isWsText(out[out.length - 1]!)) out.pop()
        const last = out[out.length - 1]
        if (last && isText(last)) last.value = trimWsEnd(last.value)
      }
    }

    const nodes = mergeTexts(out as Inline[])
    if (mode === 'nested' && trailing.length > 0) {
      distribute(trailing, [nodes], this.diagnostics)
      return { nodes, trailing: [] }
    }
    return { nodes, trailing }
  }

  // ── Link targets (§5.5) ─────────────────────────────────────────────────

  private link(children: Inline[], written: string): Link {
    const folded = written.replace(/\n/g, '')
    const base: Link = {
      _type: 'Link',
      kind: 'page',
      children,
      href: '',
      raw: '',
      path: null,
      target: '',
      attributes: [],
    }

    // A SCHEME never crosses a line end, and an escaped `:` is no scheme colon.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(written)) {
      if (scalarLength(folded) > LIMITS.valueLength) this.diagnostics.push(diag('CDN-0035'))
      return { ...base, kind: 'external', href: folded }
    }

    if (folded === '') {
      // Wiki link: the plain text of the link text names the page.
      const title = plainText(children)
      const { path, climbed } = normalizePath('/' + title)
      let valid = title !== '' && !climbed && !path.endsWith('/')
      for (const ch of title) if (isControl(ch) || isBidiControl(ch)) valid = false
      if (!valid) {
        this.diagnostics.push(diag('CDN-0032'))
        return base
      }
      return { ...base, path: { path: path + '.cutdown', query: [], fragment: '' } }
    }

    const sigils: Record<string, LinkKind> = { '#': 'id', '^': 'ref', '~': 'tag', '@': 'cite' }
    const kind = sigils[folded[0]!]
    if (kind) {
      const target = folded.slice(1).replace(/\\(.)/g, '$1')
      let valid: boolean
      switch (kind) {
        case 'id':
          valid = isIdValue(target)
          break
        case 'ref':
          valid = isIdName(target)
          break
        case 'tag':
          valid = target
            .split('/')
            .every(
              (lv) =>
                lv !== '' && lv !== '.' && lv !== '..' && ![...lv].some((ch) => isControl(ch) || isBidiControl(ch))
            )
          break
        default:
          valid = target !== '' && ![...target].some(isControl)
      }
      if (!valid) this.diagnostics.push(diag('CDN-0033', undefined, target))
      return { ...base, kind, target: kind === 'id' ? target.normalize('NFC') : target }
    }

    const r = readLocator(folded, 'page')
    this.diagnostics.push(...r.diagnostics)
    if (r.locator) {
      if (!hasCutdownExtension(r.locator.path)) r.locator.path += '.cutdown'
      r.locator.fragment = r.locator.fragment.normalize('NFC')
    }
    return { ...base, raw: r.raw, path: r.locator }
  }

  private image(alt: Inline[], written: string): Inline {
    const folded = written.replace(/\n/g, '')
    if (folded.startsWith('https://')) {
      if (scalarLength(folded) > LIMITS.valueLength) this.diagnostics.push(diag('CDN-0035'))
      return { _type: 'EmbedImageInline', alt, url: folded, attributes: [] }
    }
    const r = readLocator(folded, 'image')
    this.diagnostics.push(...r.diagnostics)
    return { _type: 'ImageInline', alt, raw: r.raw, src: r.locator, attributes: [] }
  }
}

/** Merge adjacent Text nodes and collapse interior whitespace runs (§15.1). */
function mergeTexts(nodes: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const n of nodes) {
    const last = out[out.length - 1]
    if (n._type === 'Text' && last?._type === 'Text') last.value += n.value
    else out.push(n._type === 'Text' ? { _type: 'Text', value: n.value } : n)
  }
  return out
    .map((n) => (n._type === 'Text' ? { _type: 'Text' as const, value: n.value.replace(/[ \t]+/g, ' ') } : n))
    .filter((n) => n._type !== 'Text' || n.value !== '')
}
