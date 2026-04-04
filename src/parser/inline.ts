import type { Attribute, Diagnostic } from '../types/document/common.ts'
import type {
  Inline, InlineParseResult,
  Text, Emphasis, Strong, Strikethrough, CodeInline,
  Link, ImageInline, Span, MathInline, Variable, QuoteInline, LinkKind,
} from '../types/document/inline.ts'
import { parseAttrBlock } from './attrs.ts'
import { isIdChar } from './utils.ts'

// ─── Special characters per spec §4 ──────────────────────────────────────────

export const SPECIAL_CHARS = new Set([
  '=', '#', '*', '_', '~', '`', '$', '[', ']', '(', ')', '!',
  '{', '}', ':', '-', '>', '/', '\\', '|', '"', "'",
])

// ─── Public parse helpers ─────────────────────────────────────────────────────

/** Parse inline content from a (possibly multi-line) string. */
export function parseInlineText(text: string): InlineParseResult {
  const scanner = new InlineScanner(text)
  return scanner.scan()
}

/** Parse inline content from an array of lines (joined with \n internally). */
export function parseInlineLines(lines: string[]): InlineParseResult {
  if (lines.length === 0) return { nodes: [], trailingAttrGroups: [], diagnostics: [] }
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

// ─── InlineScanner ────────────────────────────────────────────────────────────

class InlineScanner {
  private chars: string[]
  private pos: number = 0
  private nodes: Inline[] = []
  private trailingAttrGroups: Attribute[][] = []
  private diagnostics: Diagnostic[] = []

  constructor(text: string) {
    this.chars = [...text]
  }

  scan(): InlineParseResult {
    while (this.pos < this.chars.length) {
      this.step()
    }
    const merged = mergeText(this.nodes)
    if (this.trailingAttrGroups.length > 0 && merged.length > 0) {
      const last = merged[merged.length - 1] || { type: '' }
      if (last.type === 'Text') {
        ;(last as Text).value = (last as Text).value.trimEnd()
        if ((last as Text).value === '') merged.pop()
      }
    }
    return { nodes: merged, trailingAttrGroups: this.trailingAttrGroups, diagnostics: this.diagnostics }
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
    if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = []
    this.nodes.push({ type: 'Text', value: s })
  }

  private pushNode(node: Inline): void {
    if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = []
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

    if (c === '*' && this.ch(1) === '*') {
      if (this.tryDelimited('**', 'Emphasis')) return
    }

    if (c === '_' && this.ch(1) === '_') {
      if (this.tryDelimited('__', 'Strong')) return
    }

    if (c === '~' && this.ch(1) === '~') {
      if (this.tryDelimited('~~', 'Strikethrough')) return
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

  private tryCodeInline(): boolean {
    const start = this.pos
    this.pos += 2
    let content = ''
    let closed = false
    while (this.pos < this.chars.length) {
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
    let attrs: Attribute[] | undefined
    if (this.ch() === '{' && this.ch(1) !== '{') {
      const r = this.readAttrBlock()
      if (r && r.attrs.length > 0) attrs = r.attrs
    }
    const node: CodeInline = { type: 'CodeInline', value: content }
    if (attrs) node.attributes = attrs
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
    this.pushNode({ type: 'MathInline', formula: content })
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
    const otherDelims = ['**', '__', '~~', '""', "''"].filter((d) => d !== delim)
    for (const cd of otherDelims) {
      let count = 0
      let ci = 0
      while (ci <= rawInner.length - cd.length) {
        if (rawInner.slice(ci, ci + cd.length) === cd) { count++; ci += cd.length }
        else ci++
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
      case 'Strikethrough':
        node = { type: 'Strikethrough', children, ...(attrs ? { attributes: attrs } : {}) } as Strikethrough
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

  private tryImageInline(): boolean {
    const start = this.pos
    this.pos += 2

    const altChars = this.readBracketContent()
    if (altChars === null || this.ch() !== '(') {
      this.pos = start + 1
      this.pushText('!')
      return true
    }
    this.pos++
    const src = this.readUntil(')')
    if (src === null) {
      this.pos = start + 1
      this.pushText('!')
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
    const node: ImageInline = { type: 'ImageInline', alt: altResult.nodes, src }
    if (attrs) node.attributes = attrs
    this.pushNode(node)
    return true
  }

  private tryLink(): boolean {
    const start = this.pos
    this.pos++

    const textChars = this.readBracketContent()
    if (textChars === null) {
      this.pos = start + 1
      this.pushText('[')
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
      const node: Link = {
        type: 'Link',
        kind: 'external',
        href,
        children: textResult.nodes,
        ...(attrs ? { attributes: attrs } : {}),
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
      const node: Link = {
        type: 'Link',
        kind,
        target: resolvedTarget,
        children: textResult.nodes,
        ...(attrs ? { attributes: attrs } : {}),
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
    if (!closed || trimmedKey === '' || !/^[a-zA-Z0-9._-]+$/.test(trimmedKey)) {
      const raw = this.chars.slice(start, this.pos).join('')
      if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = []
      this.nodes.push({ type: 'Text', value: raw })
      return true
    }
    this.pushNode({ type: 'Variable', key: trimmedKey })
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
    let attrs: Attribute[] | undefined
    {
      let tempPos = this.pos
      while (tempPos < this.chars.length && this.chars[tempPos] === ' ') tempPos++
      if (tempPos < this.chars.length && this.chars[tempPos] === '{' && this.chars[tempPos + 1] !== '{') {
        this.pos = tempPos
        const r = this.readAttrBlock()
        if (r && r.attrs.length > 0) attrs = r.attrs
      }
    }
    const node: Span = { type: 'Span', name, children: [] }
    if (attrs) node.attributes = attrs
    this.pushNode(node)
    return true
  }

  private tryInlineAttrs(): boolean {
    const r = this.readAttrBlock()
    if (!r) return false

    const { attrs, diagnostics } = r
    this.diagnostics.push(...diagnostics)

    if (attrs.length === 0) {
      this.trailingAttrGroups.push([])
      return true
    }

    const lastNonText = this.findLastNonTextNode()
    if (
      lastNonText !== null &&
      !('attributes' in lastNonText && (lastNonText as { attributes?: Attribute[] }).attributes)
    ) {
      ;(lastNonText as { attributes?: Attribute[] }).attributes = attrs
      if (this.nodes.length > 0) {
        const last = this.nodes[this.nodes.length - 1] || { type: '' }
        if (last.type === 'Text') {
          ;(last as Text).value = (last as Text).value.trimEnd()
          if ((last as Text).value === '') this.nodes.pop()
        }
      }
    } else if (lastNonText !== null) {
      this.trailingAttrGroups.push(attrs)
    } else {
      this.trailingAttrGroups.push(attrs)
    }
    return true
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

  private readAttrBlock(): { attrs: Attribute[]; diagnostics: Diagnostic[] } | null {
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
    return parseAttrBlock(raw)
  }
}
