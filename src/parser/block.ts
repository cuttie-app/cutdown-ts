import type {
  Attribute,
  Block,
  CodeBlock,
  Diagnostic,
  EmbedBlock,
  FileBlock,
  FileGroup,
  Inline,
  InjectBlock,
  LineReflection,
  List,
  ListItemLike,
  Loc,
  MathBlock,
  Meta,
  MetaFormat,
  NamedBlock,
  Paragraph,
  QuoteBlock,
  RefDefinition,
  Row,
  Section,
  SectionLevel,
  SpoilerBlock,
  Table,
  ColumnAlign,
} from '../types/document'
import { parseGroupRun, splitTrailingGroups } from './attrs.ts'
import { type Slot, distribute, parseInline } from './inline.ts'
import { type Line, cutLine, indentOf, isBlank, sliceLine, stripIndent } from './lines.ts'
import { readLocator } from './locator.ts'
import {
  LIMITS,
  diag,
  hasCutdownExtension,
  isIdName,
  isWs,
  scalarLength,
  trimWs,
  trimWsEnd,
  trimWsStart,
} from './utils.ts'

// ─── Sequence items ──────────────────────────────────────────────────────────

/** A segment comment standing in a block sequence until its anchor is known (§7.3). */
export interface CommentMarker {
  _type: '#comment'
  loc: Loc
  text: string
}

export interface PageBreakMarker {
  _type: '#pagebreak'
}

export type SeqItem = Block | Meta | CommentMarker | PageBreakMarker

/** A scope chain waiting for its last group (§6.1.2, Rule B). */
export interface Chain {
  groups: Attribute[][]
  slots: Slot[]
}

export interface CommentRecord {
  loc: Loc
  text: string
  /** The block the comment stands before, or null at the end of `owner` */
  next: object | null
  /** The Page or block container whose sequence holds the comment */
  owner: object
}

/** State shared by every scope of one parse. */
export interface ParseState {
  diagnostics: Diagnostic[]
  comments: CommentRecord[]
}

export interface ScopeResult {
  items: SeqItem[]
  /** The chain of the last block, left for the enclosing container to extend */
  tail: Chain | null
}

interface ScopeOptions {
  /** The scope is a list item body: its first line is never a list marker (§4.7) */
  noListFirst?: boolean
  /** The block before this scope's first line, for a leading `##` line (§7.2) */
  prev?: Block | null
}

// ─── Line tests ──────────────────────────────────────────────────────────────

const FENCE_RE = /^(`{3,}|~{3,}|\${3,}|#{3,}|:{3,}|\^{3,})/
const QUOTE_RE = /^>(?=[ \t]|$)/
const CAPTION_RE = /^\^(?=[ \t]|$)/
const HEADING_RE = /^(=+)(?:[ \t]+|$)/
const REFDEF_RE = /^\[\^([a-zA-Z0-9._-]+)\]:(?:[ \t]+|$)/
const CONTROL_CLASS = '\\u0000-\\u001f\\u007f-\\u009f'
const CODE_WORD_RE = new RegExp(`^[^\`\\t {${CONTROL_CLASS}][^\\t {${CONTROL_CLASS}]*`)
const NAME_WORD_RE = new RegExp(`^[^:\\t {${CONTROL_CLASS}][^\\t {${CONTROL_CLASS}]*`)
const META_WORD_RE = new RegExp(`^[^~\\t ${CONTROL_CLASS}][^\\t ${CONTROL_CLASS}]*`)

const fenceOf = (l: Line): string | null => FENCE_RE.exec(stripIndent(l).s)?.[1] ?? null

interface Marker {
  col: number
  contentStart: number
  kind: List['kind']
  checked: boolean
  num: number
}

/** §12.1.3 BULLET_OPEN, TASK_OPEN, ORDERED_OPEN */
function listMarker(l: Line): Marker | null {
  const col = indentOf(l)
  const t = l.s.slice(col)
  let len: number
  let kind: List['kind']
  let checked = false
  let num = 1
  if (t[0] === '-' && (t.length === 1 || isWs(t[1]))) {
    const task = /^-[ \t]\[([ xX+])\](?=[ \t]|$)/.exec(t)
    if (task) {
      kind = 'checklist'
      checked = task[1] !== ' '
      len = task[0].length
    } else {
      kind = 'bullet'
      len = 1
    }
  } else {
    const ord = /^(\d{1,5})\.(?=[ \t]|$)/.exec(t)
    if (!ord) return null
    kind = 'numbered'
    num = parseInt(ord[1]!, 10)
    len = ord[0].length
  }
  let p = col + len
  while (isWs(l.s[p])) p++
  return { col, contentStart: p, kind, checked, num }
}

/** A line holding only `{…}` groups (§6.1.2 trailing attribute line). */
function attrLine(content: string): { groups: Attribute[][]; diagnostics: Diagnostic[] } | null {
  const t = trimWs(content)
  return t.startsWith('{') ? parseGroupRun(t) : null
}

/**
 * The inline source of a run of lines: soft breaks become `\n`, and a
 * continuation line's whitespace beyond the base column becomes one space
 * (§15.1).
 */
function inlineSource(first: string, rest: string[], base: number): string {
  let src = first
  for (const c of rest) {
    const body = trimWsStart(c)
    src += '\n' + (c.length - body.length > base ? ' ' : '') + body
  }
  return src
}

const lineReflection = (c: { text: string; loc: Loc }): LineReflection => ({ loc: c.loc, text: c.text })

const CAPTIONABLE = new Set([
  'Table',
  'CodeBlock',
  'MathBlock',
  'EmbedBlock',
  'NamedBlock',
  'SpoilerBlock',
  'QuoteBlock',
])

/** The node that owns the last line of a block, for a `##` line after it (§7.2). */
export function ownerOf(b: Block): { reflections: LineReflection[] } {
  switch (b._type) {
    case 'List':
      return b.children[b.children.length - 1]!
    case 'Table':
      return b.rows[b.rows.length - 1]!
    case 'FileGroup':
      return b.children[b.children.length - 1]!
    case 'QuoteBlock':
    case 'Section': {
      const last = (b._type === 'Section' ? b.children : (b.children as Block[]))[b.children.length - 1]
      return last && isBlockNode(last) ? ownerOf(last) : b
    }
    default:
      return b
  }
}

const BLOCK_TYPES = new Set([
  'Paragraph',
  'Section',
  'CodeBlock',
  'MathBlock',
  'QuoteBlock',
  'List',
  'Table',
  'FileGroup',
  'EmbedBlock',
  'InjectBlock',
  'NamedBlock',
  'SpoilerBlock',
  'RefDefinition',
])

export const isBlockNode = (n: unknown): n is Block =>
  typeof n === 'object' && n !== null && BLOCK_TYPES.has((n as Block)._type)

/** Leading and trailing blank lines of a container body are dropped (§11.6). */
function trimEdges(lines: Line[]): Line[] {
  let a = 0
  let b = lines.length
  while (a < b && isBlank(lines[a]!)) a++
  while (b > a && isBlank(lines[b - 1]!)) b--
  return lines.slice(a, b)
}

/**
 * The line that closes a NamedBlock or SpoilerBlock opened before `start`, or
 * `lines.length` when none does. Opaque fences hide their bodies, and nested
 * containers are counted (§4.13, §4.15).
 */
function findContainerClose(lines: Line[], start: number, kind: ':' | '^'): number {
  const stack: string[] = []
  let boundary = true
  for (let k = start; k < lines.length; k++) {
    const l = lines[k]!
    if (isBlank(l)) {
      boundary = true
      continue
    }
    const top = stack[stack.length - 1]
    const fence = fenceOf(l)
    if (top && '`~$#'.includes(top)) {
      if (fence?.[0] === top) {
        stack.pop()
        boundary = true
      }
      continue
    }
    if (!fence) {
      boundary = false
      continue
    }
    const ch = fence[0]!
    if ('`~$'.includes(ch)) {
      if (boundary) stack.push(ch)
      continue
    }
    if (ch === '#') {
      stack.push(ch)
      continue
    }
    boundary = true
    if (ch === ':') {
      const word = NAME_WORD_RE.exec(stripIndent(l).s.slice(3))?.[0] ?? ''
      if (isIdName(word)) stack.push(':')
      else if (top === ':') stack.pop()
      else if (stack.length === 0 && kind === ':') return k
      else stack.push(':')
    } else if (top === '^') stack.pop()
    else if (stack.length === 0 && kind === '^') return k
    else stack.push('^')
  }
  return lines.length
}

// ─── Scope ───────────────────────────────────────────────────────────────────

/**
 * One block scope (§2.5): the document root, or the body of a container. It
 * turns lines into a flat sequence of blocks; Sections and Pages are derived
 * from that sequence afterwards (§16).
 */
export class Scope {
  private i = 0
  private readonly items: SeqItem[] = []
  /** Chain of the last block; distributed once another block follows */
  private pend: Chain | null = null
  /** The last block, for a `##` line or caption that follows it */
  private last: Block | null
  /** A blank line, a CommentBlock, a Meta, or a PageBreaker came after `last` */
  private gap: boolean
  private readonly captioned = new WeakSet<object>()

  constructor(
    readonly L: Line[],
    readonly depth: number,
    readonly root: boolean,
    readonly st: ParseState,
    readonly opts: ScopeOptions = {}
  ) {
    this.last = opts.prev ?? null
    this.gap = !this.last
  }

  private get diags(): Diagnostic[] {
    return this.st.diagnostics
  }

  parse(): ScopeResult {
    while (this.i < this.L.length) {
      const l = this.L[this.i]!
      if (isBlank(l)) {
        this.gap = true
        this.i++
        continue
      }
      this.block(l)
    }
    return { items: this.items, tail: this.pend }
  }

  // ── Emission ──────────────────────────────────────────────────────────────

  private flushPend(): void {
    if (this.pend) distribute(this.pend.groups, this.pend.slots, this.diags)
    this.pend = null
  }

  private emit(block: Block, chain: Chain | null): void {
    this.flushPend()
    this.items.push(block)
    this.last = block
    this.pend = chain
    this.gap = false
    this.trailers(block)
  }

  private marker(loc: Loc, text: string): void {
    this.items.push({ _type: '#comment', loc, text })
  }

  /**
   * Lines that emit no block and attach backwards (§6.2): a standalone `##`
   * line, a trailing `{attrs}` line, and a caption line.
   */
  private trailers(block: Block): void {
    while (this.i < this.L.length) {
      const l = this.L[this.i]!
      if (isBlank(l) || fenceOf(l)) return
      const cut = cutLine(l)
      const pre = trimWs(cut.content)
      if (pre === '' && cut.comment) {
        ownerOf(block).reflections.push(lineReflection(cut.comment))
        this.i++
        continue
      }
      const run = attrLine(pre)
      if (run) {
        this.diags.push(...run.diagnostics)
        if (this.pend) this.pend.groups.push(...run.groups)
        else distribute(run.groups, [], this.diags)
        if (cut.comment) ownerOf(block).reflections.push(lineReflection(cut.comment))
        this.i++
        continue
      }
      if (CAPTION_RE.test(pre) && CAPTIONABLE.has(block._type) && !this.captioned.has(block)) {
        this.captioned.add(block)
        const { nodes } = parseInline(trimWsStart(pre.slice(1)), 'caption', this.diags)
        ;(block as { caption: Inline[] }).caption = nodes
        if (cut.comment) {
          const target =
            block._type === 'Table' ? block.rows[block.rows.length - 1]! : (block as { reflections: LineReflection[] })
          target.reflections.push(lineReflection(cut.comment))
        }
        this.i++
        continue
      }
      return
    }
  }

  // ── Classification (§12.1.3) ──────────────────────────────────────────────

  private block(l: Line): void {
    const t = stripIndent(l).s
    const fence = FENCE_RE.exec(t)?.[1]
    if (fence) {
      switch (fence[0]) {
        case '`':
          return this.codeBlock(l)
        case '~':
          return this.meta(l)
        case '$':
          return this.mathBlock(l)
        case '#':
          return this.commentBlock(l)
        case ':':
        case '^':
          if (this.depth + 1 > LIMITS.blockDepth) {
            this.diags.push(diag('CDN-0040'))
            return this.paragraph()
          }
          return this.container(l, fence[0])
      }
    }
    if (t.startsWith('---')) {
      if (this.root) return this.pageBreak(t)
      this.diags.push(diag('CDN-0017'))
      return this.paragraph()
    }

    // No block opener begins with a backslash: an escaped marker is text (§13.2).
    if (t[0] === '\\') return this.paragraph()

    const cut = cutLine(l)
    const pre = trimWsStart(cut.content)
    if (pre === '' && cut.comment) {
      if (this.last && !this.gap) ownerOf(this.last).reflections.push(lineReflection(cut.comment))
      else this.marker(cut.comment.loc, cut.comment.text)
      this.i++
      return
    }
    if (HEADING_RE.test(pre)) return this.heading()
    if (pre[0] === '|' && !(cut.comment && !pre.endsWith('|'))) return this.table()
    if (QUOTE_RE.test(pre)) {
      if (this.depth + 1 <= LIMITS.blockDepth) return this.quote()
      this.diags.push(diag('CDN-0040'))
      return this.paragraph()
    }
    if (!(this.opts.noListFirst && this.i === 0) && listMarker(l)) return this.list()
    const ref = REFDEF_RE.exec(pre)
    if (ref) return this.refDefinition(cut, ref)
    if (pre[0] === '/') return this.fileGroup()
    if (pre.startsWith('https://')) return this.embedBlock(cut)
    if (CAPTION_RE.test(pre)) return this.orphanCaption(cut)
    return this.paragraph()
  }

  // ── Paragraph and heading (§4.1, §4.2) ────────────────────────────────────

  /**
   * Whether a line continues a paragraph or heading: the run ends at a blank
   * line, a standalone `##` line, an attribute line, a caption line, a change
   * of quote depth, or a CommentBlock fence. No other opener interrupts.
   */
  private continues(l: Line): ReturnType<typeof cutLine> | null {
    if (isBlank(l) || fenceOf(l)?.[0] === '#') return null
    const cut = cutLine(l)
    const pre = trimWs(cut.content)
    if (pre === '' && cut.comment) return null
    if (attrLine(pre) || CAPTION_RE.test(pre)) return null
    if (QUOTE_RE.test(pre) && this.depth < LIMITS.blockDepth) return null
    return cut
  }

  private paragraph(): void {
    const first = cutLine(this.L[this.i]!)
    this.i++
    const cuts = [first]
    for (let c; this.i < this.L.length && (c = this.continues(this.L[this.i]!)); this.i++) cuts.push(c)
    const src = inlineSource(
      trimWsStart(first.content),
      cuts.slice(1).map((c) => c.content),
      0
    )
    const { nodes, trailing } = parseInline(src, 'block', this.diags)
    const p: Paragraph = {
      _type: 'Paragraph',
      children: nodes,
      attributes: [],
      reflections: cuts.flatMap((c) => (c.comment ? [lineReflection(c.comment)] : [])),
    }
    this.emit(p, { groups: trailing, slots: [p, p.children] })
  }

  private orphanCaption(cut: ReturnType<typeof cutLine>): void {
    this.diags.push(diag('CDN-0008'))
    this.i++
    const text = trimWs(cut.content)
    const p: Paragraph = {
      _type: 'Paragraph',
      children: text ? [{ _type: 'Text', value: text }] : [],
      attributes: [],
      reflections: cut.comment ? [lineReflection(cut.comment)] : [],
    }
    this.emit(p, { groups: [], slots: [p] })
  }

  private heading(): void {
    const l = this.L[this.i]!
    const first = cutLine(l)
    this.i++
    const pre = trimWsStart(first.content)
    const m = HEADING_RE.exec(pre)!
    const eq = m[1]!.length
    let level: SectionLevel
    let content: string
    if (eq >= 10) {
      this.diags.push(diag('CDN-0012'))
      level = 9
      content = pre.slice(9)
    } else {
      level = eq as SectionLevel
      content = pre.slice(m[0].length)
    }
    const cuts = [first]
    for (let c; this.i < this.L.length && (c = this.continues(this.L[this.i]!)); this.i++) cuts.push(c)
    const src = inlineSource(
      content,
      cuts.slice(1).map((c) => c.content),
      indentOf(l) + 2
    )
    const { nodes, trailing } = parseInline(src, 'heading', this.diags)
    const s: Section = {
      _type: 'Section',
      level,
      heading: nodes,
      children: [],
      attributes: [],
      reflections: cuts.flatMap((c) => (c.comment ? [lineReflection(c.comment)] : [])),
    }
    this.emit(s, { groups: trailing, slots: [s, s.heading] })
  }

  // ── Fences (§11.4.2) ──────────────────────────────────────────────────────

  /**
   * Read a fence line's tail after its three symbols. `keep` names what the
   * construct keeps (§11.4.2 table); everything else is dropped with CDN-0016.
   */
  private fenceTail(
    l: Line,
    keep: { word?: RegExp; attrs?: boolean; comment?: boolean }
  ): { word: string; attrs: Attribute[]; comment?: LineReflection } {
    const line = stripIndent(l)
    let tail: string
    let comment: LineReflection | undefined
    if (keep.comment) {
      const cut = cutLine(line)
      tail = cut.content.slice(3)
      if (cut.comment) comment = lineReflection(cut.comment)
    } else tail = trimWsEnd(line.s.slice(3))
    const word = keep.word ? (keep.word.exec(tail)?.[0] ?? '') : ''
    let rest = tail.slice(word.length)
    let attrs: Attribute[] = []
    let dropped = false
    if (keep.attrs) {
      const split = splitTrailingGroups(rest, false)
      if (split.groups.length > 0) {
        this.diags.push(...split.diagnostics)
        attrs = split.groups[split.groups.length - 1]!
        if (split.groups.length > 1) dropped = true
        rest = split.body
      }
    }
    if (dropped || trimWs(rest) !== '') this.diags.push(diag('CDN-0016'))
    return { word, attrs, ...(comment ? { comment } : {}) }
  }

  /** Body lines up to the line opening with three or more `ch`; null closer when unclosed. */
  private fenceBody(ch: string): { body: Line[]; closer: Line | null } {
    const body: Line[] = []
    while (this.i < this.L.length) {
      const l = this.L[this.i++]!
      if (stripIndent(l).s.startsWith(ch.repeat(3))) return { body, closer: l }
      body.push(l)
    }
    return { body, closer: null }
  }

  private codeBlock(l: Line): void {
    const open = this.fenceTail(l, { word: CODE_WORD_RE, attrs: true, comment: true })
    this.i++
    let language = 'text'
    if (open.word !== '') {
      if (isIdName(open.word)) language = open.word
      else this.diags.push(diag('CDN-0038', undefined, open.word))
    }
    const { body, closer } = this.fenceBody('`')
    const reflections = open.comment ? [open.comment] : []
    if (closer) {
      const close = this.fenceTail(closer, { comment: true })
      if (close.comment) reflections.push(close.comment)
    } else this.diags.push(diag('CDN-0001'))
    const node: CodeBlock = {
      _type: 'CodeBlock',
      language,
      raw: body.map((b) => b.r.replace(/\\`/g, '`')).join('\n'),
      attributes: open.attrs,
      caption: [],
      reflections,
    }
    this.emit(node, { groups: [], slots: [node] })
  }

  private mathBlock(l: Line): void {
    const open = this.fenceTail(l, { attrs: true, comment: true })
    this.i++
    const { body, closer } = this.fenceBody('$')
    const reflections = open.comment ? [open.comment] : []
    if (closer) {
      const close = this.fenceTail(closer, { comment: true })
      if (close.comment) reflections.push(close.comment)
    } else this.diags.push(diag('CDN-0003'))
    const node: MathBlock = {
      _type: 'MathBlock',
      raw: body.map((b) => b.r).join('\n'),
      attributes: open.attrs,
      caption: [],
      reflections,
    }
    this.emit(node, { groups: [], slots: [node] })
  }

  private meta(l: Line): void {
    if (!this.root) {
      // §4.3: Meta is valid only at Page scope; the whole span is paragraph text.
      this.diags.push(diag('CDN-0030'))
      this.i++
      const { body, closer } = this.fenceBody('~')
      if (!closer) this.diags.push(diag('CDN-0002'))
      const text = [stripIndent(l).r, ...body.map((b) => b.r), ...(closer ? [stripIndent(closer).r] : [])].join('\n')
      const p: Paragraph = {
        _type: 'Paragraph',
        children: [{ _type: 'Text', value: text }],
        attributes: [],
        reflections: [],
      }
      this.emit(p, { groups: [], slots: [p] })
      return
    }
    const open = this.fenceTail(l, { word: META_WORD_RE })
    this.i++
    let format: MetaFormat = 'yaml'
    if (open.word !== '') {
      const w = open.word.toLowerCase()
      if (w === 'yaml' || w === 'toml' || w === 'json') format = w
      else this.diags.push(diag('CDN-0039', undefined, open.word))
    }
    const { body, closer } = this.fenceBody('~')
    if (closer) this.fenceTail(closer, {})
    else this.diags.push(diag('CDN-0002'))
    const lines = body.map((b) => b.r.replace(/\\~/g, '~'))
    this.flushPend()
    this.items.push({ _type: 'Meta', format, raw: lines.length > 0 ? lines.join('\n') + '\n' : '' })
    this.gap = true
  }

  private commentBlock(l: Line): void {
    this.fenceTail(l, {})
    this.i++
    const { body, closer } = this.fenceBody('#')
    if (closer) this.fenceTail(closer, {})
    else this.diags.push(diag('CDN-0006'))
    const firstBody = body[0]
    const lastBody = body[body.length - 1]
    const loc: Loc =
      firstBody && lastBody
        ? { start: firstBody.off, end: lastBody.off + lastBody.r.length }
        : { start: l.off + l.r.length, end: l.off + l.r.length }
    this.marker(loc, body.map((b) => b.r.replace(/\\#/g, '#')).join('\n'))
    this.gap = true
  }

  private pageBreak(t: string): void {
    if (trimWs(t.slice(3)) !== '') this.diags.push(diag('CDN-0016'))
    this.i++
    this.flushPend()
    this.items.push({ _type: '#pagebreak' })
    this.gap = true
  }

  // ── NamedBlock and SpoilerBlock (§4.13, §4.15) ────────────────────────────

  private container(l: Line, ch: ':' | '^'): void {
    const open = this.fenceTail(l, { ...(ch === ':' ? { word: NAME_WORD_RE } : {}), attrs: true, comment: true })
    let name = ''
    if (ch === ':') {
      if (isIdName(open.word)) name = open.word
      else this.diags.push(diag('CDN-0013', undefined, open.word || undefined))
    }
    const end = findContainerClose(this.L, this.i + 1, ch)
    const body = trimEdges(this.L.slice(this.i + 1, end))
    const reflections = open.comment ? [open.comment] : []
    if (end < this.L.length) {
      const close = this.fenceTail(this.L[end]!, { comment: true })
      if (close.comment) reflections.push(close.comment)
      this.i = end + 1
    } else {
      this.diags.push(diag(ch === ':' ? 'CDN-0004' : 'CDN-0005'))
      this.i = end
    }

    // §11.2 container padding: the first content line sets the base.
    const pad = body.length > 0 ? indentOf(body[0]!) : 0
    const lines = body.map((b) => sliceLine(b, Math.min(pad, indentOf(b))))
    const node: NamedBlock | SpoilerBlock =
      ch === ':'
        ? { _type: 'NamedBlock', name, children: [], attributes: open.attrs, caption: [], reflections }
        : { _type: 'SpoilerBlock', children: [], attributes: open.attrs, caption: [], reflections }
    const sub = new Scope(lines, this.depth + 1, false, this.st).parse()
    if (sub.tail) distribute(sub.tail.groups, sub.tail.slots, this.diags)
    node.children = finishSequence(sub.items, node, this.st)
    this.emit(node, { groups: [], slots: [node] })
  }

  // ── QuoteBlock (§4.6) ─────────────────────────────────────────────────────

  private quote(): void {
    const body: Line[] = []
    while (this.i < this.L.length) {
      const l = this.L[this.i]!
      if (isBlank(l)) break
      const st = stripIndent(l)
      if (QUOTE_RE.test(st.s)) {
        // One `>` and one separator; further whitespace belongs to the content.
        const k = isWs(st.s[1]) ? 2 : 1
        body.push({ ...sliceLine(st, k), marked: true })
        this.i++
        continue
      }
      // Lazy continuation: a line with no `>` at all, unless it attaches backwards.
      if (l.marked) break
      const cut = cutLine(l)
      const pre = trimWs(cut.content)
      if ((pre === '' && cut.comment) || attrLine(pre) || CAPTION_RE.test(pre)) break
      body.push({ ...sliceLine(l, Math.min(2, indentOf(l))), marked: false })
      this.i++
    }
    const node: QuoteBlock = { _type: 'QuoteBlock', children: [], attributes: [], caption: [], reflections: [] }
    const sub = new Scope(trimEdges(body), this.depth + 1, false, this.st).parse()
    const blocks = sub.items.filter(isBlockNode)
    const lastBlock = blocks[blocks.length - 1]
    let chain: Chain = { groups: [], slots: [node] }
    if (
      sub.tail &&
      sub.tail.slots[0] === lastBlock &&
      (lastBlock?._type === 'Paragraph' || lastBlock?._type === 'QuoteBlock')
    ) {
      // Rule B: the quote heads its paragraph's chain (§6.1.2, "QuoteBlock nesting").
      chain = { groups: sub.tail.groups, slots: [node, ...sub.tail.slots] }
    } else if (sub.tail) distribute(sub.tail.groups, sub.tail.slots, this.diags)
    node.children = finishSequence(sub.items, node, this.st)
    this.emit(node, chain)
  }

  // ── List (§4.7, §11.5) ────────────────────────────────────────────────────

  private list(): void {
    const roots = scanList(this.L, this.i, this.depth, this.st)
    this.i = roots.end
    const lists = buildLists(roots.items, this.depth, this.st)
    for (const list of lists) this.emit(list, null)
  }

  // ── Table (§4.8) ──────────────────────────────────────────────────────────

  private table(): void {
    const t = parseTable(this.L, this.i, this.st)
    this.i = t.end
    this.emit(t.table, t.chain)
  }

  // ── RefDefinition (§4.14) ─────────────────────────────────────────────────

  private refDefinition(cut: ReturnType<typeof cutLine>, m: RegExpExecArray): void {
    this.i++
    const pre = trimWsStart(cut.content)
    const { nodes, trailing } = parseInline(pre.slice(m[0].length), 'block', this.diags)
    const node: RefDefinition = {
      _type: 'RefDefinition',
      ref: m[1]!,
      children: nodes,
      attributes: [],
      reflections: cut.comment ? [lineReflection(cut.comment)] : [],
    }
    this.emit(node, { groups: trailing, slots: [node, node.children] })
  }

  // ── EmbedBlock (§4.9) ─────────────────────────────────────────────────────

  private embedBlock(cut: ReturnType<typeof cutLine>): void {
    this.i++
    const { body, groups, diagnostics } = splitTrailingGroups(trimWs(cut.content))
    this.diags.push(...diagnostics)
    const url = trimWs(body)
    if (scalarLength(url) > LIMITS.valueLength) this.diags.push(diag('CDN-0035'))
    const node: EmbedBlock = {
      _type: 'EmbedBlock',
      url,
      attributes: [],
      caption: [],
      reflections: cut.comment ? [lineReflection(cut.comment)] : [],
    }
    this.emit(node, { groups, slots: [node] })
  }

  // ── FileGroup, FileBlock, InjectBlock (§4.11, §4.12, §4.17) ───────────────

  /** Read a `/` line; the normalized path decides FileBlock or InjectBlock. */
  private fileLine(l: Line): { node: FileBlock | InjectBlock; groups: Attribute[][] } {
    const cut = cutLine(l)
    const { body, groups, diagnostics } = splitTrailingGroups(trimWs(cut.content))
    const written = trimWs(body)
    const probe = readLocator(written, 'file')
    const inject = probe.normalized !== '/' && (hasCutdownExtension(probe.normalized) || probe.normalized.endsWith('/'))
    const r = inject ? readLocator(written, 'inject') : probe
    this.diags.push(...diagnostics, ...r.diagnostics)
    const reflections = cut.comment ? [lineReflection(cut.comment)] : []
    if (inject) {
      if (r.locator && hasCutdownExtension(r.locator.path)) r.locator.fragment = r.locator.fragment.normalize('NFC')
      return {
        node: { _type: 'InjectBlock', raw: r.raw, src: r.locator, children: [], attributes: [], reflections },
        groups,
      }
    }
    return {
      node: { _type: 'FileBlock', raw: r.raw, src: r.locator, attributes: [], caption: [], reflections },
      groups,
    }
  }

  private fileGroup(): void {
    const first = this.fileLine(this.L[this.i]!)
    this.i++
    if (first.node._type === 'InjectBlock') {
      const node = first.node
      this.emit(node, { groups: first.groups, slots: [node] })
      return
    }
    const group: FileGroup = { _type: 'FileGroup', children: [first.node], attributes: [] }
    let chain: Chain = { groups: first.groups, slots: [group, first.node] }
    const captioned = new WeakSet<object>()
    this.flushPend()
    while (this.i < this.L.length) {
      const l = this.L[this.i]!
      if (isBlank(l) || fenceOf(l)) break
      const cut = cutLine(l)
      const pre = trimWs(cut.content)
      const fb = group.children[group.children.length - 1]!
      if (pre === '' && cut.comment) {
        fb.reflections.push(lineReflection(cut.comment))
        this.i++
        continue
      }
      const run = attrLine(pre)
      if (run) {
        this.diags.push(...run.diagnostics)
        chain.groups.push(...run.groups)
        if (cut.comment) fb.reflections.push(lineReflection(cut.comment))
        this.i++
        continue
      }
      if (CAPTION_RE.test(pre)) {
        if (captioned.has(fb)) break
        captioned.add(fb)
        fb.caption = parseInline(trimWsStart(pre.slice(1)), 'caption', this.diags).nodes
        if (cut.comment) fb.reflections.push(lineReflection(cut.comment))
        this.i++
        continue
      }
      if (pre[0] !== '/') break
      const next = this.fileLine(l)
      if (next.node._type === 'InjectBlock') break
      this.i++
      distribute(chain.groups, chain.slots, this.diags)
      group.children.push(next.node)
      chain = { groups: next.groups, slots: [group, next.node] }
    }
    this.items.push(group)
    this.last = group
    this.pend = chain
    this.gap = false
  }
}

// ─── Lists ───────────────────────────────────────────────────────────────────

interface ItemBuild {
  col: number
  /** §15.1: the item's base column, its marker's column + 2 */
  base: number
  kind: List['kind']
  checked: boolean
  num: number
  /** The marker line's content, after the marker and its whitespace, `##` cut */
  first: Line
  comment?: LineReflection
  /** Continuation lines (de-indented) and nested items, in order */
  body: (Line | ItemBuild)[]
  blank: boolean
  /** Comments from root-scope `##` lines directly after the item (§7.2) */
  direct: LineReflection[]
  /** Inside an open fence: lines are content whatever they look like */
  fence: string | null
  /** The last body line ended a block: a fence may open on the next one */
  boundary: boolean
}

const isItem = (e: Line | ItemBuild): e is ItemBuild => 'kind' in e

/**
 * §11.5 the stack-based, column-relative list model. Returns the top-level
 * items of one list run and the index of the first line after it.
 */
function scanList(L: Line[], start: number, depth: number, st: ParseState): { items: ItemBuild[]; end: number } {
  const roots: ItemBuild[] = []
  const stack: ItemBuild[] = []
  let pendingBlanks: Line[] = []
  let k = start

  const openItem = (l: Line, m: Marker): ItemBuild => {
    const content = sliceLine(l, m.contentStart)
    const cut = cutLine(content)
    const first: Line = { s: cut.content, r: cut.content, off: content.off, marked: l.marked }
    const fence = FENCE_RE.exec(first.s)?.[1]?.[0] ?? null
    return {
      col: m.col,
      base: m.col + 2,
      kind: m.kind,
      checked: m.checked,
      num: m.num,
      first,
      ...(cut.comment ? { comment: lineReflection(cut.comment) } : {}),
      body: [],
      blank: false,
      direct: [],
      fence,
      boundary: false,
    }
  }
  const deindent = (l: Line, base: number) => sliceLine(l, Math.min(base, indentOf(l)))
  /** Track an open fence in an item body so its lines are never list markers. */
  const track = (item: ItemBuild, l: Line) => {
    const f = fenceOf(l)
    if (item.fence) {
      if (f && f[0] === item.fence) {
        item.fence = null
        item.boundary = true
      }
      return
    }
    if (f && (item.boundary || f[0] === '#')) item.fence = f[0]!
    item.boundary = false
  }

  while (k < L.length) {
    const l = L[k]!
    const top = stack[stack.length - 1]
    if (top?.fence) {
      // An open fence takes every line until its closer (§11.4.2).
      top.body.push(...pendingBlanks.map((b) => deindent(b, top.base)), deindent(l, top.base))
      pendingBlanks = []
      if (isBlank(l)) top.blank = true
      else track(top, l)
      k++
      continue
    }
    if (isBlank(l)) {
      let j = k
      while (j < L.length && isBlank(L[j]!)) j++
      if (j >= L.length || indentOf(L[j]!) === 0) break
      pendingBlanks = L.slice(k, j)
      for (const it of stack) it.blank = true
      k = j
      continue
    }
    const col = indentOf(l)
    const cut = cutLine(l)
    const pre = trimWs(cut.content)

    if (pre === '' && cut.comment) {
      // §7.2: indentation places the comment in a block scope.
      let target: ItemBuild | undefined
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s]!.base <= col) {
          target = stack[s]
          break
        }
      }
      if (target || pendingBlanks.length > 0) {
        const into = target ?? stack[stack.length - 1]!
        into.body.push(...pendingBlanks.map((b) => deindent(b, into.base)), deindent(l, into.base))
        into.boundary = false
      } else stack[0]!.direct.push(lineReflection(cut.comment))
      pendingBlanks = []
      k++
      continue
    }

    const m = listMarker(l)
    if (m) {
      while (stack.length > 0 && m.col <= stack[stack.length - 1]!.col) stack.pop()
      if (depth + stack.length + 1 > LIMITS.blockDepth) {
        st.diagnostics.push(diag('CDN-0040'))
      } else {
        const item = openItem(l, m)
        const parent = stack[stack.length - 1]
        if (parent) parent.body.push(item)
        else roots.push(item)
        stack.push(item)
        pendingBlanks = []
        k++
        continue
      }
    }

    if (stack.length === 0) break
    if (CAPTION_RE.test(pre) && col < stack[0]!.base) break
    while (stack.length >= 2 && col < stack[stack.length - 2]!.col) stack.pop()
    const target = stack[stack.length - 1]!
    if (pendingBlanks.length > 0) target.boundary = true
    target.body.push(...pendingBlanks.map((b) => deindent(b, target.base)), deindent(l, target.base))
    pendingBlanks = []
    track(target, l)
    k++
  }
  return { items: roots, end: k }
}

/** Group sibling items into Lists; a change of marker kind opens a new List (§4.7.2). */
function buildLists(items: ItemBuild[], depth: number, st: ParseState): List[] {
  const lists: { list: List; chains: { groups: Attribute[][]; item: ListItemLike; inline: Inline[] | null }[] }[] = []
  for (const it of items) {
    let cur = lists[lists.length - 1]
    if (!cur || cur.list.kind !== it.kind) {
      const start = it.kind === 'numbered' ? (it.num === 0 ? 1 : it.num) : 1
      cur = { list: { _type: 'List', kind: it.kind, start, loose: false, children: [], attributes: [] }, chains: [] }
      lists.push(cur)
    }
    if (it.blank) cur.list.loose = true
    const built = buildItem(it, depth + 1, st)
    cur.list.children.push(built.node)
    cur.chains.push({ groups: built.groups, item: built.node, inline: built.inline })
  }
  // §6.1.2: only the last item of a List reaches the List.
  for (const { list, chains } of lists) {
    chains.forEach((c, idx) => {
      if (c.groups.length === 0) return
      const slots: Slot[] = idx === chains.length - 1 ? [list, c.item] : [c.item]
      if (c.inline) slots.push(c.inline)
      distribute(c.groups, slots, st.diagnostics)
    })
  }
  return lists.map((l) => l.list)
}

function buildItem(
  it: ItemBuild,
  depth: number,
  st: ParseState
): { node: ListItemLike; groups: Attribute[][]; inline: Inline[] | null } {
  const node: ListItemLike =
    it.kind === 'checklist'
      ? { _type: 'TaskItem', checked: it.checked, children: [], attributes: [], reflections: [] }
      : { _type: 'ListItem', children: [], attributes: [], reflections: [] }
  if (it.comment) node.reflections.push(it.comment)
  node.reflections.push(...it.direct)

  // Runs of lines become block sequences; runs of nested items become Lists.
  const segments: (Line[] | ItemBuild[])[] = []
  for (const e of [it.first, ...it.body]) {
    const lastSeg = segments[segments.length - 1]
    const nested = isItem(e)
    if (lastSeg && (lastSeg.length > 0 && isItem(lastSeg[0]!)) === nested) (lastSeg as (Line | ItemBuild)[]).push(e)
    else segments.push([e] as Line[] | ItemBuild[])
  }

  const items: SeqItem[] = []
  let tail: Chain | null = null
  let prev: Block | null = null
  segments.forEach((seg, idx) => {
    if (isItem(seg[0]!)) {
      if (tail) distribute(tail.groups, tail.slots, st.diagnostics)
      tail = null
      const lists = buildLists(seg as ItemBuild[], depth, st)
      items.push(...lists)
      prev = lists[lists.length - 1] ?? prev
      return
    }
    const lines = trimEdges(seg as Line[])
    if (tail) distribute(tail.groups, tail.slots, st.diagnostics)
    const sub = new Scope(lines, depth, false, st, { noListFirst: idx === 0, prev }).parse()
    items.push(...sub.items)
    tail = sub.tail
    const blocks = sub.items.filter(isBlockNode)
    prev = blocks[blocks.length - 1] ?? prev
  })

  const blocks = items.filter(isBlockNode)
  let groups: Attribute[][] = []
  let inline: Inline[] | null = null
  const t = tail as Chain | null
  if (t) {
    const only = blocks.length === 1 && blocks[0]!._type === 'Paragraph' && t.slots[0] === blocks[0]
    if (only) {
      // The body is one paragraph: its chain belongs to the item (§6.1.2).
      groups = t.groups
      inline = (blocks[0] as Paragraph).children
    } else distribute(t.groups, t.slots, st.diagnostics)
  }
  node.children = finishSequence(items, node, st)
  return { node, groups, inline }
}

// ─── Table (§4.8) ────────────────────────────────────────────────────────────

const ALIGN: [RegExp, ColumnAlign][] = [
  [/^:-{2,}$/, 'left'],
  [/^-{2,}:$/, 'right'],
  [/^:-+:$/, 'center'],
  [/^-{2,},$/, 'comma'],
  [/^-{2,}\.$/, 'decimal'],
  [/^-{3,}$/, 'start'],
]

const alignOf = (cell: string): ColumnAlign | null => {
  const t = trimWs(cell)
  for (const [re, a] of ALIGN) if (re.test(t)) return a
  return null
}

/** Split a row on unescaped `|`; the text before the first `|` is dropped. */
function splitRow(pre: string): string[] {
  const parts: string[] = []
  let cur = ''
  for (let k = 1; k < pre.length; k++) {
    const c = pre[k]!
    if (c === '\\' && k + 1 < pre.length) {
      cur += c + pre[k + 1]
      k++
      continue
    }
    if (c === '|') {
      parts.push(cur)
      cur = ''
    } else cur += c
  }
  parts.push(cur)
  return parts
}

/** Whether `rest` holds only whitespace and attribute groups. */
const onlyGroups = (rest: string): Attribute[][] | null =>
  trimWs(rest) === '' ? [] : (parseGroupRun(rest)?.groups ?? null)

function parseTable(L: Line[], start: number, st: ParseState): { table: Table; chain: Chain; end: number } {
  const diags = st.diagnostics
  const table: Table = { _type: 'Table', rows: [], columns: [], attributes: [], caption: [] }
  const rows = table.rows
  /** Rows a header separator would mark: content rows since the last separator */
  let section: Row[] = []
  let align: ColumnAlign[] | null = null
  let sepWidth = 0
  let colCount = -1
  const content: { row: Row; groups: Attribute[][]; inline: Inline[] | null; cells: number }[] = []
  let k = start

  while (k < L.length) {
    const l = L[k]!
    if (isBlank(l)) break
    const cut = cutLine(l)
    const pre = trimWs(cut.content)
    if (pre === '' && cut.comment) {
      rows[rows.length - 1]!.reflections.push(lineReflection(cut.comment))
      k++
      continue
    }
    if (pre[0] !== '|' || (cut.comment && !pre.endsWith('|'))) break
    k++
    const comment = cut.comment ? lineReflection(cut.comment) : null
    const parts = splitRow(pre)

    // §4.8 SEPARATOR_ROW
    const closerGroups = parts.length > 1 ? onlyGroups(parts[parts.length - 1]!) : null
    const sepCells = closerGroups ? parts.slice(0, -1) : parts
    const aligns = sepCells.map(alignOf)
    if (sepCells.length > 0 && aligns.every((a) => a !== null)) {
      if (section.length === 0) {
        const empty: Row = { _type: 'Header', children: [], attributes: [], reflections: [] }
        rows.push(empty)
      } else for (const r of section) r._type = 'Header'
      section = []
      if (!align) {
        align = aligns as ColumnAlign[]
        sepWidth = aligns.length
      }
      if (closerGroups && closerGroups.length > 0) distribute([closerGroups[closerGroups.length - 1]!], [table], diags)
      if (comment) rows[rows.length - 1]!.reflections.push(comment)
      continue
    }

    // Content row: the last `|` is the closer when only attributes follow it.
    const sealedGroups = onlyGroups(parts[parts.length - 1]!)
    const sealed = sealedGroups !== null
    const cellTexts = sealed ? parts.slice(0, -1) : parts
    const row: Row = { _type: 'Row', children: [], attributes: [], reflections: comment ? [comment] : [] }
    let groups: Attribute[][] = sealedGroups ?? []
    let inline: Inline[] | null = null
    cellTexts.forEach((text, idx) => {
      const open = !sealed && idx === cellTexts.length - 1
      const r = parseInline(trimWs(text), open ? 'block' : 'nested', diags)
      if (open) {
        groups = r.trailing
        inline = r.nodes
      }
      row.children.push({ _type: 'Cell', children: r.nodes, row: 0, column: idx })
    })
    if (colCount < 0 && row.children.length > 0) colCount = row.children.length
    rows.push(row)
    section.push(row)
    content.push({ row, groups, inline, cells: row.children.length })
  }

  // Column count: fixed by the first content row with cells (§4.8 Table shape).
  const count = Math.max(colCount, 0)
  rows.forEach((row, r) => {
    if (row.children.length > count) {
      row.children.length = count
      diags.push(diag('CDN-0018'))
    }
    for (let c = row.children.length; c < count; c++)
      row.children.push({ _type: 'Cell', children: [], row: r, column: c })
    for (const cell of row.children) cell.row = r
  })
  if (align && colCount > 0 && sepWidth > count) diags.push(diag('CDN-0018'))
  for (let c = 0; c < count; c++) table.columns.push({ _type: 'Column', align: align?.[c] ?? 'start' })

  // Row chains: only the last content row reaches the Table (§4.8).
  content.forEach((c, idx) => {
    if (idx === content.length - 1) return
    distribute(c.groups, c.inline ? [c.row, c.inline] : [c.row], diags)
  })
  const lastRow = content[content.length - 1]
  const chain: Chain = lastRow
    ? { groups: lastRow.groups, slots: lastRow.inline ? [table, lastRow.row, lastRow.inline] : [table, lastRow.row] }
    : { groups: [], slots: [table] }
  return { table, chain, end: k }
}

// ─── Derived structure (§16) ─────────────────────────────────────────────────

/**
 * Close a block sequence: register its segment comments with the block each
 * one stands before, then run the sectionization fold (§16.1).
 */
export function finishSequence(items: SeqItem[], owner: object, st: ParseState): Block[] {
  const blocks: Block[] = []
  let waiting: CommentMarker[] = []
  for (const it of items) {
    if (it._type === '#comment') {
      waiting.push(it)
      continue
    }
    if (!isBlockNode(it)) continue
    for (const m of waiting) st.comments.push({ loc: m.loc, text: m.text, next: it, owner })
    waiting = []
    blocks.push(it)
  }
  for (const m of waiting) st.comments.push({ loc: m.loc, text: m.text, next: null, owner })
  return foldSections(blocks)
}

/** §16.1: a Section spans to the next heading of its level or above. */
function foldSections(blocks: Block[]): Block[] {
  const out: Block[] = []
  const stack: Section[] = []
  for (const b of blocks) {
    if (b._type === 'Section') {
      while (stack.length > 0 && stack[stack.length - 1]!.level >= b.level) stack.pop()
      ;(stack.length > 0 ? stack[stack.length - 1]!.children : out).push(b)
      stack.push(b)
    } else (stack.length > 0 ? stack[stack.length - 1]!.children : out).push(b)
  }
  return out
}
