import type {
  Attribute,
  Block,
  CodeBlock,
  CommentBlock,
  Column,
  Diagnostic,
  Document,
  FileGroup,
  FileRef,
  FileRefGroup,
  ImageBlock,
  Inline,
  List,
  ListItem,
  ListItemLike,
  Loc,
  MathBlock,
  Meta,
  NamedBlock,
  Page,
  PageBreak,
  Paragraph,
  QuoteBlock,
  Reflection,
  RefDefinition,
  Row,
  Section,
  SpoilerBlock,
  Table,
  TaskItem,
} from '../types/document'
import { extractTrailingAttrGroups, parseAttrBlock } from './attrs.ts'
import { parseInlineLines, parseInlineText } from './inline.ts'
import {
  detectFileGroup,
  isHeaderSeparatorRow,
  isIdChar,
  isIdStart,
  isListMarkerLine,
  parseColumnAlign,
  splitCells,
  splitGridSeparator,
} from './utils.ts'

// ─── Scope-chain distribution ─────────────────────────────────────────────────

/**
 * Distribute an attribute chain to available scope slots (right-to-left).
 * slots[0] is Slot 1 (last {}), slots[1] is Slot 2, etc.
 * If a slot is an array (Inline[]), find the last non-Text node.
 */
const distributeScopeChain = (groups: Attribute[][], slots: unknown[], _diagnostics: Diagnostic[]): void => {
  let slotIdx = 0
  for (let groupIdx = groups.length - 1; groupIdx >= 0; groupIdx--) {
    const group = groups[groupIdx] || []

    while (slotIdx < slots.length) {
      const slot = slots[slotIdx++]
      if (!slot) continue

      if (Array.isArray(slot)) {
        let found = false
        for (let j = slot.length - 1; j >= 0; j--) {
          const n = slot[j] as Record<string, unknown>
          if (typeof n === 'object' && n['type'] !== 'Text') {
            if (group.length > 0) n['attributes'] = group
            found = true
            break
          }
        }
        if (found) break
        // Array slot had no eligible node — fall through to next slot for this group
      } else if (typeof slot === 'object') {
        if (group.length > 0) (slot as Record<string, unknown>)['attributes'] = group
        break
      }
    }

    // Spec §5.2: excess front attrs with no slot are silently dropped (no diagnostic)
  }
}

// ─── Post-processing ──────────────────────────────────────────────────────────

const isRefDefinition = (b: Block): b is RefDefinition => b.type === 'RefDefinition'

/**
 * §4.9: an `![…](…)` line is an ImageBlock only when the image is the line's
 * only segment — nothing may follow it but trailing `{attrs}`.
 */
const isOnlySegmentImageLine = (line: string): boolean => {
  const m = line.match(/^!\[([^\]]*)]\(([^)]*)\)(.*)?$/)
  if (!m) return false
  const rest = (m[3] ?? '').trim()
  return rest === '' || rest.startsWith('{')
}

const isBlockType = (type: string): boolean => {
  return [
    'Section',
    'Paragraph',
    'CodeBlock',
    'Meta',
    'QuoteBlock',
    'List',
    'Table',
    'FileRef',
    'ImageBlock',
    'FileRefGroup',
    'NamedBlock',
    'RefDefinition',
    'MathBlock',
    'SpoilerBlock',
    'Spacer',
  ].includes(type)
}

const nestSections = (blocks: Block[]): Block[] => {
  const result: Block[] = []
  const stack: Array<{ level: number; section: Section }> = []

  for (const block of blocks) {
    if (block.type === 'Section') {
      const sec = block as Section
      // @ts-ignore
      while (stack.length > 0 && stack[stack.length - 1] && stack[stack.length - 1].level >= sec.level) stack.pop()
      if (stack.length > 0) {
        stack[stack.length - 1]?.section.children.push(sec)
      } else {
        result.push(sec)
      }
      stack.push({ level: sec.level, section: sec })
    } else {
      if (stack.length > 0) stack[stack.length - 1]?.section.children.push(block)
      else result.push(block)
    }
  }
  return result
}

const deduplicateRefDefs = (blocks: Block[]) => {
  const last = new Map<string, number>()
  blocks.forEach((b, i) => {
    if (isRefDefinition(b)) last.set(b.id, i)
  })
  return blocks.filter((b, i) => !isRefDefinition(b) || last.get(b.id) === i)
}

const blockFileGroup = (block: Block): FileGroup | undefined => {
  if (block.type === 'FileRef') return detectFileGroup((block as FileRef).path) ?? undefined
  if (block.type === 'ImageBlock') return 'image'
  return undefined
}

const groupFileRefs = (blocks: Block[]) => {
  const result: Block[] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    if (!b || (b as unknown as Record<string, unknown>)['type'] === 'Spacer') {
      i++
      continue
    }
    const group = blockFileGroup(b)
    if (group !== undefined) {
      const children: (FileRef | ImageBlock)[] = [b as FileRef | ImageBlock]
      while (i + 1 < blocks.length) {
        // If the last added child already has a caption, close the group here (mid-run)
        const lastChild = children[children.length - 1]
        if (lastChild && (lastChild as unknown as Record<string, unknown>)['caption']) break
        const next = blocks[i + 1]
        if (!next) break
        if ((next as unknown as Record<string, unknown>)['type'] === 'Spacer') break
        if (blockFileGroup(next) === group) {
          i++
          children.push(blocks[i] as FileRef | ImageBlock)
        } else break
      }

      if (children.length > 1 || children[0]?.type === 'FileRef') {
        const groupNode: FileRefGroup = { type: 'FileRefGroup', group, children, attributes: [] }
        // Move caption from last child to group
        const lastItem = children[children.length - 1]
        if (lastItem) {
          const lastAny = lastItem as unknown as Record<string, unknown>
          if (lastAny['caption']) {
            ;(groupNode as unknown as Record<string, unknown>)['caption'] = lastAny['caption']
            delete lastAny['caption']
          }
          const attrGroups = lastAny['attrGroups'] as Attribute[][] | undefined
          if (attrGroups && attrGroups.length > 0) {
            const slots: unknown[] = [groupNode, lastItem]
            if (lastItem.type === 'ImageBlock') slots.push(lastItem.alt)
            distributeScopeChain(attrGroups, slots, [])
          }
        }
        result.push(groupNode)
      } else if (children[0]) {
        result.push(children[0])
      }
    } else if (b) {
      result.push(b)
    }
    i++
  }
  return result
}

const processListItemChildren = (children: (Block | Inline)[]): (Block | Inline)[] => {
  const blocks = children.filter(
    (c) => typeof c === 'object' && 'type' in c && isBlockType((c as Block).type)
  ) as Block[]

  if (blocks.length === 0) return children

  const processedBlocks = processBlocks(blocks)

  // Pure block list (no inline siblings) — just return processed blocks
  if (blocks.length === children.length) return processedBlocks

  // Mixed inline + block children: preserve original order, substituting
  // each original block with its processed counterpart in sequence.
  // This handles the case where block elements (QuoteBlock, nested List) appear
  // at any position relative to inline nodes.
  if (processedBlocks.length === blocks.length) {
    let blockIdx = 0
    return children.map((child) => (blocks.includes(child as Block) ? processedBlocks[blockIdx++]! : child))
  }

  // Fallback: block count changed after processing (e.g. section nesting merged items).
  // Put inlines first to avoid losing them.
  const inlines = children.filter((c) => !blocks.includes(c as Block))
  return [...inlines, ...processedBlocks]
}

const processBlocks = (blocks: Block[]): Block[] => {
  let result = nestSections(blocks)
  result = deduplicateRefDefs(result)
  result = groupFileRefs(result)
  result = result.filter((b) => (b as unknown as Record<string, unknown>)['type'] !== 'Spacer')

  for (const block of result) {
    if (
      block.type === 'Section' ||
      block.type === 'QuoteBlock' ||
      block.type === 'NamedBlock' ||
      block.type === 'SpoilerBlock'
    ) {
      ;(block as unknown as Record<string, unknown>)['children'] = processBlocks(
        (block as unknown as Record<string, Block[]>)['children'] as Block[]
      )
    } else if (block.type === 'List') {
      for (const item of (block as List).children) {
        item.children = processListItemChildren(item.children)
      }
    }
  }

  return result
}

// ─── Table row helper ─────────────────────────────────────────────────────────

const parseTableRowLine = (
  line: string
): { cells: string[]; cellsText: string; attrGroups: Attribute[][]; comment?: { text: string } } => {
  const trimmed = line.trim()
  let comment: { text: string } | undefined
  let work = trimmed
  const hashIdx = findRowCommentSplit(work)
  if (hashIdx >= 0) {
    const text = work.slice(hashIdx + 2).trimStart()
    comment = { text }
    work = work.slice(0, hashIdx).trimEnd()
  }
  const { text: cellsPart, groups } = extractTrailingAttrGroups(work)
  const cellsText = cellsPart.trimEnd()
  const cells = splitCells(cellsText)
  return { cells, cellsText, attrGroups: groups, ...(comment ? { comment } : {}) }
}

/**
 * Parse a `+…+` separator line: extract comment, attrGroups, and column segments.
 * §4.8: `+` rows never mark headers — colons in them are inert.
 */
const parseGridSeparatorLine = (
  line: string
): { segments: string[]; attrGroups: Attribute[][]; comment?: { text: string } } => {
  const trimmed = line.trim()
  let work = trimmed
  let comment: { text: string } | undefined
  const hashIdx = findRowCommentSplit(work)
  if (hashIdx >= 0) {
    const text = work.slice(hashIdx + 2).trimStart()
    comment = { text }
    work = work.slice(0, hashIdx).trimEnd()
  }
  const { text: withoutAttrs, groups: attrGroups } = extractTrailingAttrGroups(work)
  const segments = splitGridSeparator(withoutAttrs)
  return { segments, attrGroups, ...(comment ? { comment } : {}) }
}

/**
 * Locate `##` outside of code/math/quoted inline contexts in a table row line.
 * Returns -1 if no comment split is found. A naive scan is enough — table cells
 * cannot contain block-level structures, and §2.2 says `##` is opaque to other
 * delimiters anyway.
 */
const findRowCommentSplit = (line: string): number => {
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === '\\') {
      i++
      continue
    }
    if (line[i] === '#' && line[i + 1] === '#') return i
  }
  return -1
}

/**
 * Locate the `##` comment split in a raw source line for `loc` computation.
 * Skips escaped characters and closed ``…`` CodeInline spans, where `##` is literal.
 */
const findRawCommentSplit = (line: string): number => {
  let i = 0
  while (i < line.length - 1) {
    const c = line[i]
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '`' && line[i + 1] === '`') {
      let j = i + 2
      while (j < line.length - 1 && !(line[j] === '`' && line[j + 1] === '`')) j++
      if (j < line.length - 1) {
        i = j + 2
        continue
      }
    }
    if (c === '#' && line[i + 1] === '#') return i
    i++
  }
  return -1
}

// ─── BlockParser ──────────────────────────────────────────────────────────────

export class BlockParser {
  readonly lines: string[]
  private pos: number = 0
  readonly insideContainer: boolean
  /** Raw-file offset of each line's first character; absent in container sub-parsers */
  readonly lineStarts?: number[]
  public diagnostics: Diagnostic[] = []

  constructor(lines: string[], insideContainer = false, lineStarts?: number[]) {
    this.lines = lines
    this.insideContainer = insideContainer
    this.lineStarts = lineStarts
  }

  /**
   * §2.2: `loc` of a `##` payload — raw-file UTF-16 code-unit offsets, end-exclusive.
   * Undefined when raw offsets are unavailable (container sub-parsers).
   */
  private commentLoc(docLine: number, payload: string): Loc | undefined {
    const lineStart = this.lineStarts?.[docLine]
    const rawLine = this.lines[docLine]
    if (lineStart === undefined || rawLine === undefined) return undefined
    const idx = findRawCommentSplit(rawLine)
    if (idx < 0) return undefined
    let col = idx + 2
    while (col < rawLine.length && rawLine[col] === ' ') col++
    return { start: lineStart + col, end: lineStart + col + payload.length }
  }

  private makeReflection(docLine: number, payload: string): Reflection {
    const loc = this.commentLoc(docLine, payload)
    return loc ? { loc, text: payload } : { text: payload }
  }

  // ── Document entry ────────────────────────────────────────────────────────

  parseDocument(): Document {
    const rawBlocks = this.parseBlocks()
    const pages = this.buildPages(rawBlocks)
    const processed = pages.map((p) => ({
      ...p,
      children: processBlocks(p.children),
    }))
    return { type: 'Document', children: processed }
  }

  /**
   * §9.6 pagination fold. A PageBreak always closes the current Page (Ghost if
   * empty) and produces no node. A Meta block always closes the current Page and
   * opens a new one, except when the current Page is the untouched initial
   * Page[0] (no meta, no content, no PageBreak consumed) — then it fills that
   * Page's meta slot. CommentBlock and blank lines are pass-through.
   */
  private buildPages(blocks: Block[]): Page[] {
    const pages: Page[] = [{ meta: null, children: [] }]
    let untouchedInitial = true
    for (const block of blocks) {
      const t = (block as unknown as Record<string, unknown>)['type']
      if (t === 'Spacer' || t === 'CommentBlock') {
        pages[pages.length - 1]?.children.push(block)
      } else if (t === 'PageBreak') {
        pages.push({ meta: null, children: [] })
        untouchedInitial = false
      } else if (block.type === 'Meta') {
        if (untouchedInitial) {
          const cur = pages[pages.length - 1]
          if (cur) cur.meta = block as Meta
          untouchedInitial = false
        } else {
          pages.push({ meta: block as Meta, children: [] })
        }
      } else {
        pages[pages.length - 1]?.children.push(block)
        untouchedInitial = false
      }
    }
    return pages
  }

  // ── Block collection ──────────────────────────────────────────────────────

  parseBlocks() {
    const blocks: (Block | RefDefinition)[] = []

    const CAPTIONABLE = new Set([
      'Table',
      'ImageBlock',
      'CodeBlock',
      'MathBlock',
      'FileRef',
      'FileRefGroup',
      'NamedBlock',
      'SpoilerBlock',
      'QuoteBlock',
    ])

    const addReflection = (block: Block, entry: Reflection) => {
      const b = block as unknown as Record<string, unknown>
      b['reflection'] = [...((b['reflection'] as Reflection[] | undefined) ?? []), entry]
    }

    const lastNonSpacer = (): Block | null => {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i] as unknown as Record<string, unknown>
        if (b['type'] !== 'Spacer') return blocks[i] as Block
      }
      return null
    }

    while (this.pos < this.lines.length) {
      if (this.isBlank()) {
        blocks.push({ type: 'Spacer' } as unknown as Block)
        this.pos++
        continue
      }

      // §2.2: standalone `##` line — attaches to preceding block's reflection
      const peekLine = this.peek().trimStart()
      if (peekLine.startsWith('##') && !peekLine.startsWith('###')) {
        const docLine = this.pos
        this.advance()
        const text = peekLine.slice(2).trimStart()
        const entry: Reflection = this.makeReflection(docLine, text)
        const prev = lastNonSpacer()
        if (prev) {
          addReflection(prev, entry)
        } else {
          blocks.push({ type: 'Paragraph', children: [], attributes: [], reflection: [entry] } as unknown as Block)
        }
        continue
      }

      const block = this.parseBlock()

      // Consume trailing attr lines (for non-Paragraph blocks)
      if (block.type !== 'Paragraph') {
        const attrLines: string[] = []
        while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
          attrLines.push(this.advance())
        }
        if (attrLines.length > 0) {
          const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join('\n'))
          this.diagnostics.push(...diagnostics)
          const group = trailingAttrGroups[trailingAttrGroups.length - 1]
          if (group && group.length > 0) {
            ;(block as unknown as Record<string, unknown>)['attributes'] = group
          }
        }
      }

      // §6.5: caption binding for captionable blocks
      if (CAPTIONABLE.has(block.type)) {
        // Look ahead past any standalone ## lines (attach to block reflection)
        while (this.pos < this.lines.length) {
          const nextLine = this.peek().trimStart()
          if (nextLine.startsWith('##') && !nextLine.startsWith('###')) {
            const docLine = this.pos
            this.advance()
            addReflection(block as Block, this.makeReflection(docLine, nextLine.slice(2).trimStart()))
          } else break
        }

        // Check for `^ ` caption line
        if (this.pos < this.lines.length && this.peek().startsWith('^ ')) {
          const captionLine = this.advance()
          const captionRaw = captionLine.slice(2)

          // CDN-0009: trailing {attrs} on caption line → literal text + warning
          const {
            nodes: captionNodes,
            comments: captionComments,
            trailingAttrGroups: captionAttrGroups,
          } = parseInlineText(captionRaw)

          if (captionAttrGroups.some((g) => g.length > 0)) {
            this.diagnostics.push({ code: 'CDN-0009', level: 'warning' })
            // Re-extract raw trailing attr text for literal representation
            const { text: captionMain } = extractTrailingAttrGroups(captionRaw)
            const trailRaw = captionRaw.trimEnd().slice(captionMain.length)
            const last = captionNodes[captionNodes.length - 1]
            if (last?.type === 'Text') {
              ;(last as unknown as { value: string }).value += trailRaw
            } else if (trailRaw) {
              captionNodes.push({ type: 'Text', value: trailRaw } as unknown as Inline)
            }
          }

          // Any ## in caption text → attach to block reflection
          for (const c of captionComments) {
            addReflection(block as Block, this.makeReflection(this.pos - 1, c.text))
          }

          if (block.type === 'QuoteBlock') {
            ;(block as unknown as Record<string, unknown>)['attribution'] = captionNodes
          } else {
            ;(block as unknown as Record<string, unknown>)['caption'] = captionNodes
          }
        }
      }

      blocks.push(block)
    }
    return blocks
  }

  private isBlank(offset = 0): boolean {
    const l = this.lines[this.pos + offset]
    return l !== undefined && l.trim() === ''
  }

  private peek(offset = 0): string {
    return this.lines[this.pos + offset] ?? ''
  }

  private advance(): string {
    return this.lines[this.pos++] ?? ''
  }

  // ── Block dispatch ────────────────────────────────────────────────────────

  parseBlock() {
    const raw = this.peek()
    const line = raw.trimStart()

    if (line.startsWith('```')) return this.parseCodeBlock()
    if (line.startsWith('~~~')) return this.parseMetaBlock()
    if (line.startsWith('$$$')) return this.parseMathBlock()
    if (/^###\s*$/.test(line)) return this.parseCommentBlock()
    if (line.startsWith('^^^')) {
      const rest = line.replace(/^\^+/, '').trim()
      if (rest === '' || rest.startsWith('{')) return this.parseSpoilerBlock()
    }
    if (line.startsWith('---')) return this.parsePageBreak()
    if (line.startsWith('|')) {
      // §4.8: if `##` appears mid-line, the pre-`##` substring must still be a
      // valid row (end with `|`); otherwise fall through to Paragraph.
      const hashIdx = findRowCommentSplit(line)
      if (hashIdx < 0 || line.slice(0, hashIdx).trimEnd().endsWith('|')) {
        return this.parseTable()
      }
    }
    if (line.startsWith('+-')) {
      return this.parseTable()
    }
    // §6.5: orphaned caption line → CDN-0008 + Paragraph
    if (line.startsWith('^ ') || line === '^') {
      this.diagnostics.push({ code: 'CDN-0008', level: 'warning' })
      return this.parseParagraph()
    }
    if (line.startsWith('>')) return this.parseQuoteBlock()
    if (line.startsWith('![')) {
      // §4.9: classification is provisional — an image line carrying anything
      // other than trailing {attrs} fails the only-segment rule and falls back
      // to a Paragraph with an ImageInline.
      return isOnlySegmentImageLine(line) ? this.parseImageBlock() : this.parseParagraph()
    }
    if (line.startsWith('/')) return this.parseFileRef()
    if (line.startsWith('[^')) return this.parseRefDefinition()

    if (line.startsWith(':::')) {
      const rest = line.slice(3)
      if (rest.length > 0 && isIdStart(rest[0] || '')) return this.parseNamedBlock()
      this.advance()
      this.diagnostics.push({ code: 'CDN-0013', level: 'warning' })
      return { type: 'Paragraph', children: [{ type: 'Text', value: line }] } as Paragraph
    }

    if (line.startsWith('=')) {
      let eqCount = 0
      while (eqCount < line.length && line[eqCount] === '=') eqCount++
      if (eqCount < line.length && line[eqCount] === ' ') {
        return this.parseHeading(eqCount)
      }
    }

    if (isListMarkerLine(line)) {
      return this.parseList()
    }

    return this.parseParagraph()
  }

  // ── CodeBlock ─────────────────────────────────────────────────────────────

  private parseCodeBlock() {
    const openLine = this.advance().trimStart()
    const rest = openLine.slice(3).trim()

    let language = 'text'
    let attrs: Attribute[] | undefined

    if (rest !== '') {
      const braceIdx = rest.indexOf('{')
      if (braceIdx >= 0) {
        language = rest.slice(0, braceIdx).trim() || 'text'
        const r = parseAttrBlock(rest.slice(braceIdx))
        if (r.attrs.length > 0) attrs = r.attrs
        this.diagnostics.push(...r.diagnostics)
      } else {
        language = rest
      }
    }

    const contentLines: string[] = []
    let closed = false
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos] || ''
      if (l.trim() === '```') {
        this.pos++
        closed = true
        break
      }
      // §8.3: `\`` in body emits literal backtick; escaped fence line stays content.
      contentLines.push(l.replace(/\\`/g, '`'))
      this.pos++
    }
    if (!closed) {
      this.diagnostics.push({ code: 'CDN-0001', level: 'warning' })
      if (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') contentLines.pop()
    }

    const raw = contentLines.join('\n')
    const node: CodeBlock = { type: 'CodeBlock', language, raw, attributes: [] }
    if (attrs) node.attributes = attrs
    return node
  }

  // ── MetaBlock ─────────────────────────────────────────────────────────────

  private parseMetaBlock() {
    const openLine = this.advance().trimStart()
    const f = openLine.slice(3).trim().toLowerCase()
    const format = ['yaml', 'toml', 'json'].includes(f) ? f : 'yaml'

    const contentLines: string[] = []
    const rawSpanLines: string[] = [openLine]
    let closed = false
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos] || ''
      rawSpanLines.push(l)
      if (l.trim() === '~~~') {
        this.pos++
        closed = true
        break
      }
      // §8.3: `\~` in body emits literal tilde; escaped fence line stays content.
      contentLines.push(l.replace(/\\~/g, '~'))
      this.pos++
    }
    if (!closed) {
      this.diagnostics.push({ code: 'CDN-0002', level: 'warning' })
    }

    if (this.insideContainer) {
      this.diagnostics.push({ code: 'CDN-0030', level: 'warning' })
      const rawText = rawSpanLines.join('\n')
      return { type: 'Paragraph', children: [{ type: 'Text', value: rawText }] } as Paragraph
    }

    while (contentLines.length > 0 && contentLines[contentLines.length - 1]?.trim() === '') contentLines.pop()
    const raw = contentLines.join('\n') + (contentLines.length > 0 ? '\n' : '')
    return { type: 'Meta', format, raw } as Meta
  }

  // ── MathBlock ─────────────────────────────────────────────────────────────

  private parseMathBlock() {
    const openLine = this.advance().trimStart()
    const rest = openLine.slice(3).trim()
    let attrs: Attribute[] | undefined
    if (rest.startsWith('{')) {
      const r = parseAttrBlock(rest)
      if (r.attrs.length > 0) attrs = r.attrs
      this.diagnostics.push(...r.diagnostics)
    }

    const contentLines: string[] = []
    let closed = false
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos] || ''
      if (l.trim() === '$$$') {
        this.pos++
        closed = true
        break
      }
      contentLines.push(l)
      this.pos++
    }
    if (!closed) {
      this.diagnostics.push({ code: 'CDN-0003', level: 'warning' })
      if (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') contentLines.pop()
    }

    const raw = contentLines.join('\n')
    const node: MathBlock = { type: 'MathBlock', raw, attributes: [] }
    if (attrs) node.attributes = attrs
    return node
  }

  // ── CommentBlock ──────────────────────────────────────────────────────────

  private parseCommentBlock() {
    const openLine = this.advance()
    void openLine

    const contentLines: string[] = []
    let closed = false
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos] || ''
      if (/^###\s*$/.test(l.trim())) {
        this.pos++
        closed = true
        break
      }
      // §8.3: `\#` in body emits literal `#` (uniform replacement)
      const escaped = l.replace(/\\#/g, '#')
      contentLines.push(escaped)
      this.pos++
    }
    if (!closed) {
      this.diagnostics.push({ code: 'CDN-0006', level: 'warning' })
    }
    const text = contentLines.length > 0 ? contentLines.join('\n') + '\n' : ''
    return { type: 'CommentBlock', text } as CommentBlock
  }

  // ── PageBreak ─────────────────────────────────────────────────────────────

  /**
   * §4.10: a top-level line beginning `---`. Consumed by the pagination fold —
   * no node reaches the emitted tree. Anything after the leading `---` (surplus
   * hyphens included) is dropped with CDN-0016. Inside containers a `---` line
   * is not a PageBreak: it parses as a literal paragraph with CDN-0017.
   */
  private parsePageBreak() {
    const line = this.advance().trimStart()

    if (this.insideContainer) {
      this.diagnostics.push({ code: 'CDN-0017', level: 'warning' })
      return { type: 'Paragraph', children: [{ type: 'Text', value: line }], attributes: [] } as Paragraph
    }

    const tail = line.slice(3)
    if (tail.trim() !== '') {
      this.diagnostics.push({ code: 'CDN-0016', level: 'warning' })
    }
    const node: PageBreak = { type: 'PageBreak' }
    return node
  }

  // ── Heading / Section ─────────────────────────────────────────────────────

  private parseHeading(eqCount: number) {
    const docLine = this.pos
    const rawLine = this.advance()
    const line = rawLine.trimStart()
    const lines: string[] = [line.slice(eqCount + 1)]

    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      lines.push(this.advance())
    }

    if (eqCount > 9) {
      this.diagnostics.push({ code: 'CDN-0012', level: 'warning' })
      return { type: 'Paragraph', children: [{ type: 'Text', value: line }] } as Paragraph
    }

    const level = eqCount
    const fullContent = lines.join('\n')

    const { nodes: heading, trailingAttrGroups, diagnostics, comments } = parseInlineText(fullContent)
    this.diagnostics.push(...diagnostics)

    const node: Section = { type: 'Section', level, heading, attributes: [], children: [] }
    distributeScopeChain(trailingAttrGroups, [node, heading], this.diagnostics)
    if (comments.length > 0) {
      node.reflection = comments.map((c) => this.makeReflection(docLine + c.lineOffset, c.text))
    }
    return node
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  private parseTable() {
    const firstLine = this.peek().trimStart()
    if (firstLine.startsWith('+-')) {
      return this.parseMultilineTable()
    }
    return this.parsePipeTable()
  }

  private parsePipeTable(): Table {
    const tableLines: string[] = []
    const tableDocLines: number[] = []

    while (this.pos < this.lines.length) {
      const raw = this.lines[this.pos] || ''
      const line = raw.trimStart()
      if (line.startsWith('|')) {
        const hashIdx = findRowCommentSplit(line)
        if (hashIdx >= 0 && !line.slice(0, hashIdx).trimEnd().endsWith('|')) break
        tableLines.push(raw)
        tableDocLines.push(this.pos++)
      } else if (/^\+[-:]/.test(line)) {
        // §4.8: `+` rows in a pipe table are ignored entirely (colons and {attrs}
        // included, silent) — consumed so they do not interrupt the table.
        this.pos++
      } else break
    }

    const attrLines: string[] = []
    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      attrLines.push(this.advance())
    }

    const tableReflection: Reflection[] = []
    const rows: Row[] = []
    const columns: Column[] = []
    let alignmentSet = false
    let tableAttrsFromSeparator: Attribute[] | null = null

    // Track row builders to apply scope chain to last content row
    const rowBuilders: { attrGroups: Attribute[][]; row: Row }[] = []
    let rowIndex = 0

    for (let i = 0; i < tableLines.length; i++) {
      const raw = tableLines[i] || ''
      const docLine = tableDocLines[i] ?? 0
      const { cells, cellsText, attrGroups, comment } = parseTableRowLine(raw)
      if (comment) tableReflection.push(this.makeReflection(docLine, comment.text))

      if (isHeaderSeparatorRow(cellsText)) {
        // §4.8: header separator row — marks preceding rows as Header; the first
        // one sets column alignment; its {attrs} claim the Table slot directly.
        for (const rb of rowBuilders) {
          if (rb.row.type === 'Row') rb.row.type = 'Header'
        }
        if (!alignmentSet) {
          for (const seg of cells) {
            columns.push({ type: 'Column', align: parseColumnAlign(seg.trim()) })
          }
          alignmentSet = true
        }
        if (attrGroups.length > 0) {
          const last = attrGroups[attrGroups.length - 1]
          if (last && last.length > 0) tableAttrsFromSeparator = last
        }
        continue
      }

      const row: Row = {
        type: 'Row',
        children: cells.map((cellText, colIdx) => {
          const { nodes } = parseInlineText(cellText.trim())
          return { type: 'Cell' as const, children: nodes, row: rowIndex, column: colIdx }
        }),
        attributes: [],
      }
      rowBuilders.push({ attrGroups, row })
      rows.push(row)
      rowIndex++
    }

    if (!alignmentSet) {
      const colCount = Math.max(...rows.map((r) => r.children.length), 0)
      for (let i = 0; i < colCount; i++) columns.push({ type: 'Column', align: 'left' })
    }

    const table: Table = { type: 'Table', kind: 'pipe', rows, columns, attributes: [] }
    if (tableReflection.length > 0) table.reflection = tableReflection

    // Apply scope chain for non-last content rows (attrs → row only)
    for (let i = 0; i < rowBuilders.length - 1; i++) {
      const rb = rowBuilders[i]!
      if (rb.attrGroups.length > 0) distributeScopeChain(rb.attrGroups, [rb.row], this.diagnostics)
    }
    // Apply scope chain for last content row (last attr → table, preceding → row)
    const lastRb = rowBuilders[rowBuilders.length - 1]
    if (lastRb && lastRb.attrGroups.length > 0) {
      distributeScopeChain(lastRb.attrGroups, [table, lastRb.row], this.diagnostics)
    }
    // Header-separator attrs claim the Table slot (last separator with attrs wins)
    if (tableAttrsFromSeparator !== null) table.attributes = tableAttrsFromSeparator

    // Extra trailing attr lines override
    if (attrLines.length > 0) {
      const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join('\n'))
      this.diagnostics.push(...diagnostics)
      const last = trailingAttrGroups[trailingAttrGroups.length - 1]
      if (last && last.length > 0) table.attributes = last
    }

    return table
  }

  private parseMultilineTable(): Table {
    const tableLines: string[] = []
    const tableDocLines: number[] = []

    while (this.pos < this.lines.length) {
      const raw = this.lines[this.pos] || ''
      const line = raw.trimStart()
      if (line.startsWith('|') || line.startsWith('+')) {
        tableLines.push(raw)
        tableDocLines.push(this.pos++)
      } else break
    }

    const attrLines: string[] = []
    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      attrLines.push(this.advance())
    }

    const tableReflection: Reflection[] = []
    const rows: Row[] = []
    const columns: Column[] = []
    let alignmentSet = false
    let tableAttrsFromPlus: Attribute[] | null = null

    type PhaseEntry =
      | { kind: 'rowGroup'; lines: { cells: string[]; attrGroups: Attribute[][] }[] }
      | { kind: 'headerSep'; segments: string[] }
      | { kind: 'bodySep' }
    const phaseEntries: PhaseEntry[] = []
    let pendingLines: { cells: string[]; attrGroups: Attribute[][] }[] = []
    const flushPending = () => {
      if (pendingLines.length > 0) {
        phaseEntries.push({ kind: 'rowGroup', lines: pendingLines })
        pendingLines = []
      }
    }

    for (let i = 0; i < tableLines.length; i++) {
      const raw = tableLines[i] || ''
      const line = raw.trimStart()
      const docLine = tableDocLines[i] ?? 0

      if (line.startsWith('+')) {
        // §4.8: a `+` row delimits logical rows; colons in it are inert (never
        // marks Header, never sets alignment). Its {attrs} claim the Table slot
        // (last separator row with attrs wins).
        flushPending()
        const { attrGroups, comment } = parseGridSeparatorLine(raw)
        if (comment) tableReflection.push(this.makeReflection(docLine, comment.text))
        if (attrGroups.length > 0) {
          const last = attrGroups[attrGroups.length - 1]
          if (last && last.length > 0) tableAttrsFromPlus = last
        }
        phaseEntries.push({ kind: 'bodySep' })
      } else {
        const { cells, cellsText, attrGroups, comment } = parseTableRowLine(raw)
        if (comment) tableReflection.push(this.makeReflection(docLine, comment.text))
        if (isHeaderSeparatorRow(cellsText)) {
          // §4.8: in a multiline table the header separator is a FULL separator
          // row — closes the logical row, marks the preceding section as Header;
          // the first one sets alignment. Its {attrs} claim the Table slot.
          flushPending()
          if (attrGroups.length > 0) {
            const last = attrGroups[attrGroups.length - 1]
            if (last && last.length > 0) tableAttrsFromPlus = last
          }
          phaseEntries.push({ kind: 'headerSep', segments: cells })
        } else {
          pendingLines.push({ cells, attrGroups })
        }
      }
    }
    flushPending()

    let rowIndex = 0
    for (const entry of phaseEntries) {
      if (entry.kind === 'headerSep') {
        for (const r of rows) {
          if (r.type === 'Row') r.type = 'Header'
        }
        if (!alignmentSet) {
          for (const seg of entry.segments) {
            columns.push({ type: 'Column', align: parseColumnAlign(seg.trim()) })
          }
          alignmentSet = true
        }
      } else if (entry.kind === 'rowGroup') {
        const colCount = Math.max(...entry.lines.map((l) => l.cells.length), 0)
        if (colCount === 0) continue

        const colTexts: string[] = Array.from({ length: colCount }, () => '')
        for (const line of entry.lines) {
          for (let c = 0; c < colCount; c++) {
            const cell = (line.cells[c] ?? '').trim()
            if (cell) colTexts[c] = colTexts[c] ? colTexts[c] + ' ' + cell : cell
          }
        }

        const row: Row = {
          type: 'Row',
          children: colTexts.map((text, colIdx) => {
            const sub = new BlockParser([text], true)
            const cellBlocks = sub.parseBlocks()
            this.diagnostics.push(...sub.diagnostics)
            return { type: 'Cell' as const, children: cellBlocks, row: rowIndex, column: colIdx }
          }),
          attributes: [],
        }

        // Row attrs come from the last | line's attrGroups
        const lastLine = entry.lines[entry.lines.length - 1]
        if (lastLine && lastLine.attrGroups.length > 0) {
          distributeScopeChain(lastLine.attrGroups, [row], this.diagnostics)
        }

        rows.push(row)
        rowIndex++
      }
    }

    if (!alignmentSet) {
      const colCount = Math.max(...rows.map((r) => r.children.length), 0)
      for (let i = 0; i < colCount; i++) columns.push({ type: 'Column', align: 'left' })
    }

    const table: Table = { type: 'Table', kind: 'multiline', rows, columns, attributes: [] }
    if (tableReflection.length > 0) table.reflection = tableReflection

    if (tableAttrsFromPlus !== null) table.attributes = tableAttrsFromPlus

    if (attrLines.length > 0) {
      const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join('\n'))
      this.diagnostics.push(...diagnostics)
      const last = trailingAttrGroups[trailingAttrGroups.length - 1]
      if (last && last.length > 0) table.attributes = last
    }

    return table
  }

  // ── QuoteBlock ────────────────────────────────────────────────────────────

  private parseQuoteBlock() {
    const contentLines: string[] = []
    let attrs: Attribute[] | undefined
    let firstLine = true

    while (this.pos < this.lines.length && this.lines[this.pos]?.trimStart().startsWith('>')) {
      const raw = this.lines[this.pos++]
      const line = raw?.trimStart() || ''
      const rest = line.slice(1)
      const stripped = rest.startsWith(' ') ? rest.slice(1) : rest

      if (firstLine) {
        // Only extract attrs when there is text content before the {attrs} token.
        // A line that is *only* {attrs} (e.g. `> {.class}`) is kept as literal content
        // so it does not silently consume the braces without attaching them anywhere.
        const { text, groups, diagnostics: attrDiags } = extractTrailingAttrGroups(stripped)
        this.diagnostics.push(...attrDiags)
        if (text.trim() !== '' && groups.length > 0) {
          const aa = groups[groups.length - 1]
          attrs = aa && aa.length > 0 ? aa : undefined
          contentLines.push(text)
        } else {
          contentLines.push(stripped)
        }
        firstLine = false
      } else {
        contentLines.push(stripped)
      }
    }

    // A standalone {attrs} block as the *last* content line (still inside `>`)
    // is treated as trailing attrs for the QuoteBlock itself, not for any child paragraph.
    while (contentLines.length > 0) {
      const last = contentLines[contentLines.length - 1]?.trim() ?? ''
      // Only treat a line as a trailing-attr line if it consists entirely of one or more
      // {…} blocks — no other text. "{.class} content" is content, not a trailing attr.
      if (!/^\{[^}]*\}(\s*\{[^}]*\})*\s*$/.test(last)) break
      const r = parseAttrBlock(last)
      this.diagnostics.push(...r.diagnostics)
      if (r.attrs.length > 0) attrs = r.attrs
      contentLines.pop()
    }

    const sub = new BlockParser(contentLines, true)
    const children = sub.parseBlocks()
    this.diagnostics.push(...sub.diagnostics)
    const node: QuoteBlock = { type: 'QuoteBlock', children, attributes: attrs || [] }
    return node
  }

  // ── List ──────────────────────────────────────────────────────────────────

  private parseList() {
    const raw = this.peek()
    const stripped = raw.trimStart()
    const col = raw.length - stripped.length
    return this.parseListAtCol(col)
  }

  private parseListAtCol(col: number): List {
    const firstStripped = this.peek().trimStart()
    const isOrderedFirst = /^\d+\. /.test(firstStripped)
    const isTaskFirst = firstStripped.startsWith('- [')
    const list: List = { type: 'List', kind: 'bullet', start: null, loose: false, children: [], attributes: [] }
    let firstStart: number | undefined

    while (this.pos < this.lines.length) {
      const raw = this.peek()
      const stripped = raw.trimStart()
      const lineCol = raw.length - stripped.length

      if (stripped === '') {
        let offset = 1
        while (this.isBlank(offset)) offset++
        const nextRaw = this.peek(offset)
        const nextStripped = nextRaw.trimStart()
        const nextCol = nextRaw.length - nextStripped.length

        if (isListMarkerLine(nextStripped) && nextCol === col) {
          if (col === 0) break
          list.loose = true
          this.pos += offset
          continue
        }
        break
      }

      if (!isListMarkerLine(stripped) || lineCol !== col) break

      // Check if marker type changed
      const isOrderedNow = /^\d+\. /.test(stripped)
      const isTaskNow = stripped.startsWith('- [')

      // If first item was ordered, break if current is not ordered
      if (isOrderedFirst && !isOrderedNow) break
      // If first item was task, break if current is not task
      if (isTaskFirst && !isTaskNow) break
      // If first item was bullet (not ordered, not task), break if current is ordered or task
      if (!isOrderedFirst && !isTaskFirst && (isOrderedNow || isTaskNow)) break

      const result = this.parseListItemAtCol(col)
      list.children.push(result.item)
      if (result.absorbedBlank) list.loose = true
      if (firstStart === undefined && result.start !== undefined) {
        firstStart = result.start
        list.start = firstStart
      }
      if (result.attrGroups && result.attrGroups.length > 0) {
        distributeScopeChain(
          result.attrGroups,
          [list, result.item, (result.item as unknown as Record<string, unknown>)['children']],
          this.diagnostics
        )
      }
    }

    // Determine kind based on children types
    if (list.children.length > 0 && list.children.every((child) => child.type === 'TaskItem')) {
      list.kind = 'checklist'
    } else if (isOrderedFirst) {
      list.kind = 'numbered'
    } else {
      list.kind = 'bullet'
    }

    // Handle start field based on kind
    if (list.kind === 'numbered') {
      // Keep start as is for numbered lists (undefined or a number)
    } else {
      // Set start to null for non-numbered lists (bullet and checklist)
      list.start = null
    }

    return list
  }

  private parseListItemAtCol(col: number): {
    item: ListItemLike
    start?: number
    attrGroups?: Attribute[][]
    absorbedBlank: boolean
  } {
    const firstRaw = this.advance()
    const firstStripped = firstRaw.trimStart()

    let markerLen: number
    let checked: boolean | undefined
    let start: number | undefined

    const numericMatch = firstStripped.match(/^(\d+)\. /)
    if (firstStripped.startsWith('- [] ')) {
      markerLen = 5
      checked = false
    } else if (firstStripped.startsWith('- [ ] ')) {
      markerLen = 6
      checked = false
    } else if (
      firstStripped.startsWith('- [x] ') ||
      firstStripped.startsWith('- [X] ') ||
      // §4.7.2: `[+]` is the bidi-neutral checked marker
      firstStripped.startsWith('- [+] ')
    ) {
      markerLen = 6
      checked = true
    } else if (numericMatch) {
      markerLen = numericMatch[0].length
      start = parseInt(numericMatch[1] || '', 10)
    } else {
      markerLen = 2
    }

    const contentIndent = col + markerLen
    const firstContent = firstStripped.slice(markerLen)
    const contentLines: string[] = [firstContent]
    let absorbedBlank = false

    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos] || ''
      const lineStripped = line.trimStart()
      const lineCol = line.length - lineStripped.length

      if (lineStripped === '') {
        let offset = 1
        while (this.isBlank(offset)) offset++
        const nextRaw = this.peek(offset)
        const nextStripped = nextRaw.trimStart()
        const nextCol = nextRaw.length - nextStripped.length

        if (nextCol > col) {
          for (let i = 0; i < offset; i++) contentLines.push('')
          this.pos += offset
          absorbedBlank = true
          continue
        }
        break
      }

      if (lineCol <= col) break

      const stripped_content = line.length >= contentIndent ? line.slice(contentIndent) : lineStripped
      contentLines.push(stripped_content)
      this.pos++
    }

    const attrLines: string[] = []
    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      attrLines.push(this.advance())
    }

    const hasBlank = contentLines.some((l) => l.trim() === '')
    let children: (Block | Inline)[]
    let groups: Attribute[][] = []

    if (hasBlank) {
      const sub = new BlockParser(contentLines, true)
      children = sub.parseBlocks()
      this.diagnostics.push(...sub.diagnostics)
      if (attrLines.length > 0) {
        const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join('\n'))
        this.diagnostics.push(...diagnostics)
        groups = trailingAttrGroups
      }
    } else {
      const { result, trailing } = this.parseItemInlineContent(contentLines)
      children = result
      this.diagnostics.push(...trailing.diagnostics)
      groups = trailing.trailingAttrGroups
      if (attrLines.length > 0) {
        const pr = parseInlineText(attrLines.join('\n'))
        this.diagnostics.push(...pr.diagnostics)
        groups = [...groups, ...pr.trailingAttrGroups]
      }
    }

    let item: ListItemLike
    if (checked !== undefined) {
      item = { type: 'TaskItem', checked, children } as TaskItem
    } else {
      item = { type: 'ListItem', children } as ListItem
    }

    return { item, start, attrGroups: groups, absorbedBlank }
  }

  private parseItemInlineContent(contentLines: string[]): {
    result: (Block | Inline)[]
    trailing: { trailingAttrGroups: Attribute[][]; diagnostics: Diagnostic[] }
  } {
    const result: (Block | Inline)[] = []
    let trailingAttrGroups: Attribute[][] = []
    const allDiagnostics: Diagnostic[] = []

    let i = 0
    let pendingTextLines: string[] = []

    const flushText = () => {
      if (pendingTextLines.length === 0) return
      const pr = parseInlineLines(pendingTextLines)
      result.push(...pr.nodes)
      trailingAttrGroups = pr.trailingAttrGroups
      allDiagnostics.push(...pr.diagnostics)
      pendingTextLines = []
    }

    while (i < contentLines.length) {
      const line = contentLines[i] || ''
      const stripped = line.trimStart()
      const lineCol = line.length - stripped.length

      if (/^###\s*$/.test(stripped)) {
        flushText()
        const innerLines: string[] = []
        let j = i + 1
        let foundClose = false
        while (j < contentLines.length) {
          const next = (contentLines[j] || '').trimStart()
          if (/^###\s*$/.test(next)) {
            foundClose = true
            break
          }
          innerLines.push((contentLines[j] || '').replace(/\\#/g, '#'))
          j++
        }
        i = foundClose ? j : j - 1
        if (!foundClose) this.diagnostics.push({ code: 'CDN-0006', level: 'warning' })
        const text = innerLines.length > 0 ? innerLines.join('\n') + '\n' : ''
        result.push({ type: 'CommentBlock', text } as CommentBlock)
        trailingAttrGroups = []
      } else if (stripped.startsWith('>')) {
        flushText()
        const subLines: string[] = [stripped]
        let j = i + 1
        while (j < contentLines.length) {
          const next = contentLines[j] || ''
          const nextStripped = next.trimStart()
          if (nextStripped.startsWith('>')) {
            subLines.push(nextStripped)
            j++
          } else break
        }
        i = j - 1

        const subParser = new BlockParser(subLines)
        const nestedBlocks = subParser.parseBlocks()
        this.diagnostics.push(...subParser.diagnostics)
        result.push(...nestedBlocks)
        trailingAttrGroups = []
      } else if (i > 0 && isListMarkerLine(stripped)) {
        flushText()
        const subLines: string[] = [stripped]
        let j = i + 1
        while (j < contentLines.length) {
          const next = contentLines[j] || ''
          const nextStripped = next.trimStart()
          const nextCol = next.length - nextStripped.length
          if (nextCol > lineCol || isListMarkerLine(nextStripped)) {
            subLines.push(nextCol > lineCol ? next.slice(lineCol) : nextStripped)
            j++
          } else break
        }
        i = j - 1

        const subParser = new BlockParser(subLines)
        const nestedBlocks = subParser.parseBlocks()
        this.diagnostics.push(...subParser.diagnostics)
        result.push(...nestedBlocks)
        trailingAttrGroups = []
      } else {
        pendingTextLines.push(i > 0 ? line.trimStart() : line)
      }
      i++
    }
    flushText()

    return { result, trailing: { trailingAttrGroups, diagnostics: allDiagnostics } }
  }

  // ── ImageBlock ────────────────────────────────────────────────────────────

  private parseImageBlock() {
    const line = this.advance().trimStart()
    const m = line.match(/^!\[([^\]]*)]\(([^)]*)\)(.*)?$/)
    if (!m) {
      const { nodes } = parseInlineText(line)
      return { type: 'Paragraph', children: nodes } as Paragraph
    }
    const altText = m[1],
      src = m[2] || '',
      rest = (m[3] ?? '').trim()
    const attrLines: string[] = [rest]

    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      attrLines.push(this.advance())
    }

    const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join('\n'))
    this.diagnostics.push(...diagnostics)

    const { nodes: alt } = parseInlineText(altText || '')
    const node: ImageBlock = { type: 'ImageBlock', alt, src, attributes: [] }

    ;(node as unknown as Record<string, unknown>)['attrGroups'] = trailingAttrGroups
    distributeScopeChain(trailingAttrGroups, [node, alt], this.diagnostics)

    return node
  }

  // ── FileRef ───────────────────────────────────────────────────────────────

  private parseFileRef() {
    const line = this.advance().trimStart()
    const pathPart = line.slice(1)

    const { text, groups, diagnostics: attrDiags } = extractTrailingAttrGroups(pathPart)
    this.diagnostics.push(...attrDiags)

    let src = text.trim()
    const attrLines: string[] = []
    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      attrLines.push(this.advance())
    }

    let finalGroups = groups
    if (attrLines.length > 0) {
      const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join('\n'))
      this.diagnostics.push(...diagnostics)
      finalGroups = [...groups, ...trailingAttrGroups]
    }

    let fragment = ''
    let query = ''
    let path = src

    // Extract fragment (after #)
    const hashIdx = path.indexOf('#')
    if (hashIdx >= 0) {
      fragment = path.slice(hashIdx + 1)
      path = path.slice(0, hashIdx)
    }

    // Extract query (after ?)
    const queryIdx = path.indexOf('?')
    if (queryIdx >= 0) {
      query = path.slice(queryIdx)
      // path keeps the query string in it
    }

    path = '/' + path

    const node: FileRef = { type: 'FileRef', path, query, fragment, attributes: [] }

    ;(node as unknown as Record<string, unknown>)['attrGroups'] = finalGroups
    distributeScopeChain(finalGroups, [node], this.diagnostics)

    return node
  }

  // ── RefDefinition ─────────────────────────────────────────────────────────

  private parseRefDefinition() {
    const line = this.advance().trimStart()
    const m = line.match(/^\[\^([^\]]+)]:\s*(.*)/)
    if (!m) {
      const { nodes } = parseInlineText(line)
      return { type: 'Paragraph', children: nodes } as Paragraph
    }
    const id = m[1] || ''
    const content = m[2] || ''
    const { nodes: children } = parseInlineText(content)
    return { type: 'RefDefinition', id, children } as RefDefinition
  }

  // ── NamedBlock ────────────────────────────────────────────────────────────

  private parseNamedBlock() {
    const docLine = this.pos
    const openLine = this.advance().trimStart()
    const rest = openLine.slice(3)

    let name = ''
    let i = 0
    while (i < rest.length && isIdChar(rest[i] || '')) name += rest[i++]

    const afterName = rest.slice(i).trim()
    const openerAttrLines: string[] = [afterName]

    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      openerAttrLines.push(this.advance())
    }

    const {
      trailingAttrGroups,
      diagnostics: attrDiags,
      comments: openerComments,
    } = parseInlineText(openerAttrLines.join('\n'))
    this.diagnostics.push(...attrDiags)

    const node: NamedBlock = { type: 'NamedBlock', name, children: [], attributes: [] }
    distributeScopeChain(trailingAttrGroups, [node], this.diagnostics)

    if (openerComments.length > 0) {
      node.reflection = openerComments.map((c) => this.makeReflection(docLine + c.lineOffset, c.text))
    }

    const contentLines: string[] = []
    let closed = false
    let depth = 1
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos] || ''
      const trimmed = l.trim()
      if (trimmed.startsWith(':::')) {
        const afterColons = trimmed.slice(3)
        if (afterColons.length > 0 && isIdStart(afterColons[0] || '')) {
          depth++
          contentLines.push(l)
          this.pos++
        } else if (afterColons === '') {
          depth--
          if (depth === 0) {
            this.pos++
            closed = true
            break
          }
          contentLines.push(l)
          this.pos++
        } else {
          contentLines.push(l)
          this.pos++
        }
      } else {
        contentLines.push(l)
        this.pos++
      }
    }
    if (!closed) this.diagnostics.push({ code: 'CDN-0004', level: 'warning' })

    const columns = contentLines.find((l) => l.trim() !== '')?.match(/^( *)/)?.[1]
    const baseIndent = columns ? columns.length : 0
    const stripped = contentLines.map((l) => (l.length >= baseIndent ? l.slice(baseIndent) : l.trimStart()))

    const sub = new BlockParser(stripped, true)
    node.children = sub.parseBlocks()
    this.diagnostics.push(...sub.diagnostics)

    return node
  }

  // ── SpoilerBlock ──────────────────────────────────────────────────────────

  /**
   * `^^^` opens a SpoilerBlock with parsed-block content. SpoilerBlocks do not nest:
   * the first `^^^` line encountered after the opener always closes the block. Wrap
   * inner content in `:::spoiler` NamedBlock if a tiered reveal is needed.
   */
  private parseSpoilerBlock() {
    const openLine = this.advance().trimStart()
    const afterFence = openLine.replace(/^\^+/, '').trim()

    const openerAttrLines: string[] = [afterFence]
    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      openerAttrLines.push(this.advance())
    }

    const { trailingAttrGroups, diagnostics: attrDiags } = parseInlineText(openerAttrLines.join('\n'))
    this.diagnostics.push(...attrDiags)

    const node: SpoilerBlock = { type: 'SpoilerBlock', children: [], attributes: [] }
    distributeScopeChain(trailingAttrGroups, [node], this.diagnostics)

    const contentLines: string[] = []
    let closed = false
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos] || ''
      if (l.trim().startsWith('^^^')) {
        this.pos++
        closed = true
        break
      }
      contentLines.push(l)
      this.pos++
    }
    if (!closed) this.diagnostics.push({ code: 'CDN-0005', level: 'warning' })

    const columns = contentLines.find((l) => l.trim() !== '')?.match(/^( *)/)?.[1]
    const baseIndent = columns ? columns.length : 0
    const stripped = contentLines.map((l) => (l.length >= baseIndent ? l.slice(baseIndent) : l.trimStart()))

    const sub = new BlockParser(stripped, true)
    node.children = sub.parseBlocks()
    this.diagnostics.push(...sub.diagnostics)

    return node
  }

  // ── Paragraph ─────────────────────────────────────────────────────────────

  private parseParagraph() {
    const startLine = this.pos
    const paraLines: string[] = []
    while (this.pos < this.lines.length && this.lines[this.pos]?.trim() !== '') {
      const peekTrimmed = this.peek().trimStart()
      if (paraLines.length > 0 && peekTrimmed.startsWith('{')) break
      // §2.2: standalone ## line breaks the paragraph; handled as inter-block reflection
      if (peekTrimmed.startsWith('##') && !peekTrimmed.startsWith('###')) break
      // §6.5: `^ ` line at block level is a potential caption — break paragraph here
      if (paraLines.length > 0 && (peekTrimmed.startsWith('^ ') || peekTrimmed === '^')) break
      paraLines.push(this.lines[this.pos++] || '')
    }

    const attrLines: string[] = []
    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      attrLines.push(this.advance())
    }

    // §8.2: handle line-start block-opener escapes inside a paragraph context.
    const transformed: string[] = paraLines.map((l, idx) => (idx === 0 ? l : l.trimStart()))
    for (let i = 0; i < transformed.length; i++) {
      const t = transformed[i] || ''
      const m = t.match(/^\\(=+|---+|~~~+|\$\$\$+|\^\^\^+|`{3,}|###+|:::+|\/|>|-)/)
      if (!m) continue
      const marker = m[1] || ''
      const rest = t.slice(1 + marker.length)
      let reEscaped = ''
      for (const c of marker) reEscaped += '\\' + c
      transformed[i] = reEscaped + rest
    }

    const joined = transformed.join('\n')

    const { nodes, trailingAttrGroups, diagnostics, comments } = parseInlineText(joined, {
      blockLines: true,
    })
    this.diagnostics.push(...diagnostics)

    let groups = trailingAttrGroups
    if (attrLines.length > 0) {
      const pr = parseInlineText(attrLines.join('\n'))
      this.diagnostics.push(...pr.diagnostics)
      groups = [...groups, ...pr.trailingAttrGroups]
    }

    const node: Paragraph = { type: 'Paragraph', children: nodes, attributes: [] }
    if (comments.length > 0) {
      node.reflection = comments.map((c) => this.makeReflection(startLine + c.lineOffset, c.text))
    }
    distributeScopeChain(groups, [nodes, node], this.diagnostics)
    return node
  }
}
