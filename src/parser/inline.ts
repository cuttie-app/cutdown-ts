import type {
  Attribute,
  Diagnostic,
  Inline,
  InlineParseResult,
  Text,
  Emphasis,
  Strong,
  Highlight,
  CodeInline,
  Link,
  ImageInline,
  Span,
  MathInline,
  Variable,
  QuoteInline,
  Spoiler,
  LinkKind,
} from '../types/document'
import { parseAttrBlock } from './attrs.ts'
import { isIdChar } from './utils.ts'

// ─── Special characters per spec §4 ──────────────────────────────────────────

export const SPECIAL_CHARS = new Set([
  '=',
  '#',
  '*',
  '_',
  '~',
  '`',
  '$',
  '[',
  ']',
  '(',
  ')',
  '!',
  '{',
  '}',
  ':',
  '-',
  '>',
  '/',
  '\\',
  '|',
  '"',
  "'",
  '^',
])

// ─── Public parse helpers ─────────────────────────────────────────────────────

/** Parse inline content from a (possibly multi-line) string. */
export function parseInlineText(text: string): InlineParseResult {
  const scanner = new InlineScanner(text)
  return scanner.scan()
}

/** Parse inline content from an array of lines (joined with \n internally). */
export function parseInlineLines(lines: string[]): InlineParseResult {
  if (lines.length === 0) return { nodes: [], trailingAttrGroups: [], diagnostics: [], comments: [] }
  return parseInlineText(lines.join('\n'))
}

/** Merge adjacent Text nodes. */
export function mergeText(nodes: Inline[]): Inline[] {
  const result: Inline[] = []
  for (const node of nodes) {
    const last = result[result.length - 1]
    if (node.type === 'Text' && last?.type === 'Text') {
      ;(last as Text).value += (node as Text).value
    } else {
      result.push(node)
    }
  }
  return result
}

/**
 * §5.4: Distribute trailing attr groups from link text onto the link's children.
 * Each group attaches to the last non-Text child (preceding inline element).
 * Groups with no eligible target are silently dropped.
 */
function applyLinkTextAttrs(nodes: Inline[], groups: Attribute[][]): void {
  for (const group of groups) {
    if (group.length === 0) continue
    for (let j = nodes.length - 1; j >= 0; j--) {
      const n = nodes[j] as unknown as Record<string, unknown>
      if (n != null && typeof n === 'object' && n.type !== 'Text') {
        if (!n.attributes) n.attributes = group
        break
      }
    }
  }
}

// ─── InlineScanner ────────────────────────────────────────────────────────────

class InlineScanner {
  readonly chars: string[]
  private pos: number = 0
  private nodes: Inline[] = []
  private trailingAttrGroups: Attribute[][] = []
  private trailingAttrGroupsNodeCount: number = 0
  private comments: { lineOffset: number; text: string }[] = []
  private diagnostics: Diagnostic[] = []

  constructor(text: string) {
    this.chars = [...text]
  }

  scan(): InlineParseResult {
    while (this.pos < this.chars.length) {
      this.step()
    }
    const merged = mergeText(this.nodes)
    // Only trim trailing space from last Text when there are trailing attr groups
    // AND no ## comment was encountered (## acts as an end-of-line barrier)
    if (this.trailingAttrGroups.length > 0 && merged.length > 0 && this.comments.length === 0) {
      const last = merged[merged.length - 1] || { type: '' }
      if (last.type === 'Text') {
        ;(last as Text).value = (last as Text).value.trimEnd()
        if ((last as Text).value === '') merged.pop()
      }
    }
    return {
      nodes: merged,
      trailingAttrGroups: this.trailingAttrGroups,
      diagnostics: this.diagnostics,
      comments: this.comments,
    }
  }

  private ch(offset = 0): string | undefined {
    return this.chars[this.pos + offset]
  }

  private peek(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
      if (this.chars[this.pos + i] !== s[i]) return false
    }
    return true
  }

  private pushText(s: string): void {
    // §2.6: pure whitespace is transparent to trailing-attr resolution
    if (this.trailingAttrGroups.length > 0 && s.trim() !== '') {
      this.trailingAttrGroups = []
      this.trailingAttrGroupsNodeCount = 0
    }
    this.nodes.push({ type: 'Text', value: s })
  }

  private pushNode(node: Inline): void {
    if (this.trailingAttrGroups.length > 0) {
      this.trailingAttrGroups = []
      this.trailingAttrGroupsNodeCount = 0
    }
    this.nodes.push(node)
  }

  private step(): void {
    const c = this.ch()
    if (c === undefined) return

    if (c === '\\') {
      const next = this.ch(1)
      if (next === '\n') {
        this.pos += 2
        if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = []
        this.nodes.push({ type: 'TextBreak' })
        return
      }
      if (next !== undefined) {
        const isSpecial = SPECIAL_CHARS.has(next)
        this.pos += 2
        this.pushText(isSpecial ? next : '\\' + next)
        return
      }
      this.pos++
      this.pushText('\\')
      return
    }

    if (c === '\n') {
      this.pos++
      return
    }

    if (c === '`' && this.ch(1) === '`') {
      if (this.tryCodeInline()) return
    }

    if (c === '$' && this.ch(1) === '$') {
      if (this.tryLiteral2('$$', 'MathInline')) return
    }

    if (c === '#' && this.ch(1) === '#') {
      this.emitCommentInline()
      return
    }

    if (c === '*' && this.ch(1) === '*') {
      if (this.tryDelimited('**', 'Strong')) return
    }

    if (c === '_' && this.ch(1) === '_') {
      if (this.tryDelimited('__', 'Emphasis')) return
    }

    if (c === '~' && this.ch(1) === '~') {
      if (this.tryDelimited('~~', 'Highlight')) return
    }

    if (c === '^' && this.ch(1) === '^') {
      if (this.tryDelimited('^^', 'Spoiler')) return
    }

    if (c === '"' && this.ch(1) === '"') {
      if (this.tryDelimited('""', 'QuoteDouble')) return
    }

    if (c === "'" && this.ch(1) === "'") {
      if (this.tryDelimited("''", 'QuoteSingle')) return
    }

    if (c === '!' && this.ch(1) === '[') {
      if (this.tryImageInline()) return
    }

    if (c === '[') {
      if (this.tryLink()) return
    }

    if (c === '{' && this.ch(1) === '{') {
      if (this.tryVariable()) return
    }

    if (c === ':' && this.ch(1) === ':') {
      if (this.trySpan()) return
    }

    if (c === '{') {
      if (this.tryInlineAttrs()) return
    }

    this.pos++
    this.pushText(c)
  }

  private emitCommentInline(): void {
    // Count newlines before current pos to get line offset within the scanned text
    let lineOffset = 0
    for (let i = 0; i < this.pos; i++) {
      if (this.chars[i] === '\n') lineOffset++
    }

    // If trailing attr groups are active, pop any transparent whitespace nodes
    // that were pushed between the last attr group and the ## marker
    if (this.trailingAttrGroups.length > 0) {
      while (this.nodes.length > this.trailingAttrGroupsNodeCount) {
        const last = this.nodes[this.nodes.length - 1]
        if (last?.type === 'Text' && (last as Text).value.trim() === '') {
          this.nodes.pop()
        } else break
      }
    }

    this.pos += 2 // skip ##
    let text = ''
    while (this.pos < this.chars.length && this.chars[this.pos] !== '\n') {
      text += this.chars[this.pos++]
    }
    this.comments.push({ lineOffset, text: text.trimStart() })
  }

  private tryCodeInline(): boolean {
    const start = this.pos
    this.pos += 2
    let content = ''
    let closed = false
    while (this.pos < this.chars.length) {
      if (this.ch() === '\\' && this.ch(1) === '`') {
        content += '`'
        this.pos += 2
        continue
      }
      if (this.ch() === '`' && this.ch(1) === '`') {
        this.pos += 2
        closed = true
        break
      }
      content += this.chars[this.pos] === '\n' ? '' : this.chars[this.pos]
      this.pos++
    }
    if (!closed) {
      this.pos = start + 1
      this.pushText('`')
      return true
    }
    let attrs: Attribute[] = []
    if (this.ch() === '{' && this.ch(1) !== '{') {
      const r = this.readAttrBlock()
      if (r && r.attrs.length > 0) attrs = r.attrs
    }
    const node: CodeInline = { type: 'CodeInline', value: content, attributes: attrs }
    this.pushNode(node)
    return true
  }

  private tryLiteral2(delim: string, _kind: 'MathInline'): boolean {
    const start = this.pos
    this.pos += 2
    let content = ''
    let closed = false
    while (this.pos < this.chars.length) {
      if (this.peek(delim)) {
        this.pos += 2
        closed = true
        break
      }
      content += this.chars[this.pos++]
    }
    if (!closed) {
      this.pos = start + 1
      this.pushText(delim[0] || '')
      return true
    }
    const node: MathInline = { type: 'MathInline', formula: content, attributes: [] }
    this.pushNode(node)
    return true
  }

  private tryDelimited(delim: string, nodeType: string): boolean {
    const start = this.pos
    this.pos += delim.length
    const innerStart = this.pos

    let closedAt = -1
    while (this.pos < this.chars.length) {
      if (this.peek(delim)) {
        closedAt = this.pos
        this.pos += delim.length
        break
      }
      this.pos++
    }

    if (closedAt === -1) {
      this.pos = start + delim.length
      if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = []
      this.nodes.push({ type: 'Text', value: delim })
      return true
    }

    const rawInner = this.chars.slice(innerStart, closedAt).join('')
    const innerResult = parseInlineText(rawInner.trim())
    this.diagnostics.push(...innerResult.diagnostics)
    const children = innerResult.nodes

    // CDN-0014: warn on crossed inline boundaries
    const otherDelims = ['**', '__', '~~', '^^', '""', "''"].filter((d) => d !== delim)
    for (const cd of otherDelims) {
      let count = 0
      let ci = 0
      while (ci <= rawInner.length - cd.length) {
        if (rawInner.slice(ci, ci + cd.length) === cd) {
          count++
          ci += cd.length
        } else ci++
      }
      if (count % 2 !== 0 && this.chars.slice(this.pos).join('').includes(cd)) {
        this.diagnostics.push({
          code: 'CDN-0014',
          level: 'warning',
          message: `Crossed inline boundaries: "${delim}" closes while "${cd}" is still open`,
        })
      }
    }
    const openBrackets = (rawInner.match(/\[/g) ?? []).length
    const closeBrackets = (rawInner.match(/]/g) ?? []).length
    if (openBrackets > closeBrackets && this.chars.slice(this.pos).join('').includes(']')) {
      this.diagnostics.push({
        code: 'CDN-0014',
        level: 'warning',
        message: `Crossed inline boundaries: "${delim}" closes while "[" is still open`,
      })
    }

    let attrs: Attribute[] | undefined
    if (this.ch() === '{' && this.ch(1) !== '{') {
      const r = this.readAttrBlock()
      if (r && r.attrs.length > 0) attrs = r.attrs
    }

    let node: Inline
    switch (nodeType) {
      case 'Emphasis':
        node = { type: 'Emphasis', children, ...(attrs ? { attributes: attrs } : {}) } as Emphasis
        break
      case 'Strong':
        node = { type: 'Strong', children, ...(attrs ? { attributes: attrs } : {}) } as Strong
        break
      case 'Highlight':
        node = { type: 'Highlight', children, ...(attrs ? { attributes: attrs } : {}) } as Highlight
        break
      case 'Spoiler':
        node = { type: 'Spoiler', children, ...(attrs ? { attributes: attrs } : {}) } as Spoiler
        break
      case 'QuoteDouble':
        node = { type: 'QuoteInline', kind: 'double', children, ...(attrs ? { attributes: attrs } : {}) } as QuoteInline
        break
      default:
        node = { type: 'QuoteInline', kind: 'single', children, ...(attrs ? { attributes: attrs } : {}) } as QuoteInline
    }

    this.pushNode(node)
    return true
  }

  /**
   * §9.4.1 Class 2 (asymmetric opener) degradation: the entire source from the
   * opener to end of line (or to an `##`-cut) is one verbatim Text run. Closed
   * constructs inside the dead slice are lost.
   */
  private emitVerbatimSlice(start: number): void {
    let end = start
    while (end < this.chars.length) {
      const c = this.chars[end]
      if (c === '\n') break
      if (c === '\\') {
        end += 2
        continue
      }
      if (c === '#' && this.chars[end + 1] === '#') break
      end++
    }
    if (end > this.chars.length) end = this.chars.length
    this.pos = end
    this.pushText(this.chars.slice(start, end).join(''))
  }

  private tryImageInline(): boolean {
    const start = this.pos
    this.pos += 2

    const altChars = this.readBracketContent()
    if (altChars === null || this.ch() !== '(') {
      this.emitVerbatimSlice(start)
      return true
    }
    this.pos++
    const src = this.readUntil(')')
    if (src === null) {
      this.emitVerbatimSlice(start)
      return true
    }
    this.pos++

    let attrs: Attribute[] | undefined
    if (this.ch() === '{' && this.ch(1) !== '{') {
      const r = this.readAttrBlock()
      if (r && r.attrs.length > 0) attrs = r.attrs
    }

    const altResult = parseInlineText(altChars)
    this.diagnostics.push(...altResult.diagnostics)
    const node: ImageInline = { type: 'ImageInline', alt: altResult.nodes, src, attributes: attrs || [] }
    this.pushNode(node)
    return true
  }

  private tryLink(): boolean {
    const start = this.pos
    this.pos++

    const textChars = this.readBracketContent()
    if (textChars === null) {
      this.emitVerbatimSlice(start)
      return true
    }

    if (this.ch() === '(') {
      this.pos++
      const href = this.readUntil(')')
      if (href === null) {
        this.pos = start + 1
        this.pushText('[')
        return true
      }
      this.pos++

      let attrs: Attribute[] | undefined
      if (this.ch() === '{' && this.ch(1) !== '{') {
        const r = this.readAttrBlock()
        if (r && r.attrs.length > 0) attrs = r.attrs
      }

      const textResult = parseInlineText(textChars)
      this.diagnostics.push(...textResult.diagnostics)
      applyLinkTextAttrs(textResult.nodes, textResult.trailingAttrGroups)
      const node: Link = {
        type: 'Link',
        kind: 'external',
        href,
        target: '',
        children: textResult.nodes,
        attributes: attrs || [],
      }
      this.pushNode(node)
      return true
    }

    if (this.ch() === '[') {
      this.pos++
      const target = this.readUntil(']')
      if (target === null) {
        this.pos = start + 1
        this.pushText('[')
        return true
      }
      this.pos++

      let kind: LinkKind = 'page'
      let resolvedTarget = target
      if (target.startsWith('#')) {
        kind = 'tag'
        resolvedTarget = target.slice(1)
      } else if (target.startsWith('^')) {
        kind = 'ref'
        resolvedTarget = target.slice(1)
      } else if (target.startsWith('@')) {
        kind = 'cite'
        resolvedTarget = target.slice(1)
      }

      let attrs: Attribute[] | undefined
      if (this.ch() === '{' && this.ch(1) !== '{') {
        const r = this.readAttrBlock()
        if (r && r.attrs.length > 0) attrs = r.attrs
      }

      const textResult = parseInlineText(textChars)
      this.diagnostics.push(...textResult.diagnostics)
      applyLinkTextAttrs(textResult.nodes, textResult.trailingAttrGroups)
      const node: Link = {
        type: 'Link',
        kind,
        href: '',
        target: resolvedTarget,
        children: textResult.nodes,
        attributes: attrs || [],
      }
      this.pushNode(node)
      return true
    }

    this.pos = start + 1
    this.pushText('[')
    return true
  }

  private tryVariable(): boolean {
    const start = this.pos
    this.pos += 2
    let key = ''
    let closed = false
    while (this.pos < this.chars.length) {
      if (this.ch() === '}' && this.ch(1) === '}') {
        this.pos += 2
        closed = true
        break
      }
      key += this.chars[this.pos++]
    }
    const trimmedKey = key.trim()
    if (!closed) {
      // Class 2 opener with no closer: verbatim slice to EOL / ##-cut
      this.emitVerbatimSlice(start)
      return true
    }
    if (trimmedKey === '' || !/^[a-zA-Z0-9._-]+$/.test(trimmedKey)) {
      const raw = this.chars.slice(start, this.pos).join('')
      if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = []
      // Emit CDN-0015 only if the key has non-ID_LITERAL characters (not for empty key)
      if (trimmedKey !== '' && !/^[a-zA-Z0-9._-]+$/.test(trimmedKey)) {
        this.diagnostics.push({ code: 'CDN-0015', level: 'warning' })
      }
      this.nodes.push({ type: 'Text', value: raw })
      return true
    }
    const node: Variable = { type: 'Variable', key: trimmedKey, attributes: [] }
    this.pushNode(node)
    return true
  }

  private trySpan(): boolean {
    const start = this.pos
    this.pos += 2
    const nameStart = this.pos
    while (this.pos < this.chars.length && isIdChar(this.chars[this.pos] || '')) this.pos++
    const name = this.chars.slice(nameStart, this.pos).join('')
    if (name === '') {
      this.pos = start + 1
      this.pushText(':')
      return true
    }
    const node: Span = { type: 'Span', name, children: [], attributes: [] }
    this.pushNode(node)
    return true
  }

  private tryInlineAttrs(): boolean {
    const savedPos = this.pos
    const r = this.readAttrBlock()
    if (!r) {
      // `{` with no matching `}` is a Class 2 opener: verbatim slice to EOL / ##-cut
      this.emitVerbatimSlice(savedPos)
      return true
    }

    if (!r.valid) {
      // §9.4.1 literal-span idiom: a closed { } whose content violates the attribute
      // grammar is one verbatim Text run (braces included), never inline-parsed.
      this.pushText(r.raw)
      return true
    }

    const { attrs, diagnostics } = r

    if (attrs.length === 0) {
      this.diagnostics.push(...diagnostics)
      this.trailingAttrGroups.push([])
      this.trailingAttrGroupsNodeCount = this.nodes.length
      return true
    }

    const lastNonText = this.findLastNonTextNode()
    if (lastNonText === null) {
      // §6.3: no eligible slot. If non-attr/non-comment content follows, orphan → literal.
      if (this.hasNonAttrContentAfter()) {
        this.pos = savedPos
        return false
      }
      this.diagnostics.push(...diagnostics)
      this.trailingAttrGroups.push(attrs)
      this.trailingAttrGroupsNodeCount = this.nodes.length
      // Trimming of preceding whitespace is deferred to scan() (skipped if ## present)
      return true
    }

    // Middle-of-inline attachment (§10.9): when non-attr content follows, {attrs}
    // attaches directly to the preceding inline element (e.g. ::span {#id} text).
    // When only more {…} blocks or nothing follows, it's a trailing scope-chain group.
    if (
      !('attributes' in lastNonText && (lastNonText as { attributes?: Attribute[] }).attributes) &&
      this.hasNonAttrContentAfter()
    ) {
      this.diagnostics.push(...diagnostics)
      ;(lastNonText as { attributes?: Attribute[] }).attributes = attrs
      this.trimTrailingTextWhitespace()
    } else {
      this.diagnostics.push(...diagnostics)
      this.trailingAttrGroups.push(attrs)
      this.trailingAttrGroupsNodeCount = this.nodes.length
      // Trimming of preceding whitespace is deferred to scan() (skipped if ## present)
    }
    return true
  }

  private trimTrailingTextWhitespace(): void {
    if (this.nodes.length === 0) return
    const last = this.nodes[this.nodes.length - 1]
    if (last && last.type === 'Text') {
      ;(last as Text).value = (last as Text).value.trimEnd()
      if ((last as Text).value === '') this.nodes.pop()
    }
  }

  /**
   * Returns true if there is non-attr, non-whitespace content after the current position.
   * A bare `{…}` block does NOT count as "real content" — only text, delimiters, etc. do.
   */
  private hasNonAttrContentAfter(): boolean {
    let i = this.pos
    while (i < this.chars.length) {
      const c = this.chars[i]
      if (c === ' ' || c === '\n') {
        i++
        continue
      }
      // Another {…} attr block is not "real" content
      if (c === '{' && this.chars[i + 1] !== '{') return false
      // §2.6: `##` is transparent to attr resolution — skip to EOL
      if (c === '#' && this.chars[i + 1] === '#') {
        i += 2
        while (i < this.chars.length && this.chars[i] !== '\n') i++
        continue
      }
      return true
    }
    return false
  }

  private findLastNonTextNode(): Inline | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      if (this.nodes[i]?.type !== 'Text') return this.nodes[i] || null
    }
    return null
  }

  private readBracketContent(): string | null {
    const chars: string[] = []
    let depth = 0
    while (this.pos < this.chars.length) {
      const ch = this.chars[this.pos]
      // §2.2: `##` inside bracketed text degrades the link — abort.
      if (ch === '#' && this.chars[this.pos + 1] === '#') return null
      if (ch === '[') {
        depth++
        chars.push(ch)
        this.pos++
      } else if (ch === ']') {
        if (depth > 0) {
          depth--
          chars.push(ch)
          this.pos++
        } else {
          this.pos++
          return chars.join('')
        }
      } else {
        chars.push(ch || '')
        this.pos++
      }
    }
    return null
  }

  private readUntil(terminator: string): string | null {
    let s = ''
    while (this.pos < this.chars.length) {
      if (this.chars[this.pos] === terminator) return s
      s += this.chars[this.pos++]
    }
    return null
  }

  private readAttrBlock(): { attrs: Attribute[]; diagnostics: Diagnostic[]; valid: boolean; raw: string } | null {
    if (this.ch() !== '{') return null
    let depth = 0
    let end = this.pos
    while (end < this.chars.length) {
      if (this.chars[end] === '{') depth++
      else if (this.chars[end] === '}') {
        depth--
        if (depth === 0) {
          end++
          break
        }
      }
      end++
    }
    if (depth !== 0) return null
    const raw = this.chars.slice(this.pos, end).join('')
    this.pos = end
    return { ...parseAttrBlock(raw), raw }
  }
}
