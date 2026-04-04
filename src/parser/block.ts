import type {
  Attribute, Diagnostic,
  Block, Document, Page, Section, Paragraph, ThematicBreak, CodeBlock,
  Meta, QuoteBlock, List, ListItem, TaskItem, ListItemLike,
  Table, Row, Column, FileRef, FileRefGroup, ImageBlock,
  NamedBlock, RefDefinition, MathBlock, FileGroup, Inline,
} from '../types/document'
import { parseAttrBlock, extractTrailingAttrGroups } from './attrs.ts'
import { parseInlineText, parseInlineLines } from './inline.ts'
import {
  isIdStart, isIdChar, isListMarkerLine,
  isDelimiterRow, splitCells, parseColumnAlign, detectFileGroup,
} from './utils.ts'

// ─── Scope-chain distribution ─────────────────────────────────────────────────

/**
 * Distribute an attribute chain to available scope slots (right-to-left).
 * slots[0] is Slot 1 (last {}), slots[1] is Slot 2, etc.
 * If a slot is an array (Inline[]), find the last non-Text node.
 */
function distributeScopeChain(groups: Attribute[][], slots: unknown[], diagnostics?: Diagnostic[]): void {
  for (let i = 0; i < groups.length; i++) {
    const groupIdx = groups.length - 1 - i
    const group = groups[groupIdx] || []
    let claimed = false

    if (i < slots.length) {
      const slot = slots[i]
      if (slot) {
        if (Array.isArray(slot)) {
          for (let j = slot.length - 1; j >= 0; j--) {
            const n = slot[j] as Record<string, unknown>
            if (typeof n === 'object' && n['type'] !== 'Text') {
              if (group.length > 0) n['attributes'] = group
              else delete n['attributes']
              claimed = true
              break
            }
          }
        } else if (typeof slot === 'object') {
          const s = slot as Record<string, unknown>
          if (group.length > 0) s['attributes'] = group
          else delete s['attributes']
          claimed = true
        }
      }
    }

    if (!claimed) {
      diagnostics?.push({ code: 'CDN-0011', level: 'warning' })
    }
  }
}

// ─── Post-processing ──────────────────────────────────────────────────────────

function isBlockType(type: string): boolean {
  return [
    'Section', 'Paragraph', 'ThematicBreak', 'CodeBlock', 'Meta', 'QuoteBlock',
    'List', 'Table', 'FileRef', 'ImageBlock', 'FileRefGroup', 'NamedBlock',
    'RefDefinition', 'MathBlock', 'Spacer',
  ].includes(type)
}

function nestSections(blocks: Block[]): Block[] {
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

function deduplicateRefDefs(blocks: Block[]): Block[] {
  const last = new Map<string, number>()
  blocks.forEach((b, i) => {
    if (b.type === 'RefDefinition') last.set((b as RefDefinition).id, i)
  })
  return blocks.filter((b, i) => b.type !== 'RefDefinition' || last.get((b as RefDefinition).id) === i)
}

function blockFileGroup(block: Block): FileGroup | undefined {
  if (block.type === 'FileRef') return (block as FileRef).group ?? undefined
  if (block.type === 'ImageBlock') return 'image'
  return undefined
}

function groupFileRefs(blocks: Block[]): Block[] {
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
        const next = blocks[i + 1]
        if (!next) break
        if ((next as unknown as Record<string, unknown>)['type'] === 'Spacer') break
        if (blockFileGroup(next) === group) {
          i++
          children.push(blocks[i] as FileRef | ImageBlock)
        } else break
      }

      if (children.length > 1 || children[0]?.type === 'FileRef') {
        const groupNode: FileRefGroup = { type: 'FileRefGroup', group, children }
        result.push(groupNode)
        const lastItem = children[children.length - 1]
        const groups = (lastItem as unknown as Record<string, unknown>)['attrGroups'] as Attribute[][] | undefined
        if (lastItem && groups && groups.length > 0) {
          const slots: unknown[] = [groupNode, lastItem]
          if (lastItem.type === 'ImageBlock') slots.push(lastItem.alt)
          distributeScopeChain(groups, slots)
        }
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

function processListItemChildren(children: (Block | Inline)[]): (Block | Inline)[] {
  const blocks = children.filter(
    (c) => typeof c === 'object' && 'type' in c && isBlockType((c as Block).type),
  ) as Block[]
  const inlines = children.filter((c) => !blocks.includes(c as Block))

  if (blocks.length > 0) {
    const processedBlocks = processBlocks(blocks)
    return [...inlines, ...processedBlocks]
  }
  return children
}

function processBlocks(blocks: Block[]): Block[] {
  let result = nestSections(blocks)
  result = deduplicateRefDefs(result)
  result = groupFileRefs(result)
  result = result.filter((b) => (b as unknown as Record<string, unknown>)['type'] !== 'Spacer')

  for (const block of result) {
    if (block.type === 'Section' || block.type === 'QuoteBlock' || block.type === 'NamedBlock') {
      ;(block as unknown as Record<string, unknown>)['children'] = processBlocks(
        (block as unknown as Record<string, Block[]>)['children'] as Block[],
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

function parseTableRowLine(line: string): { cells: string[]; attrGroups: Attribute[][] } {
  const trimmed = line.trim()
  const { text: cellsPart, groups } = extractTrailingAttrGroups(trimmed)
  const cells = splitCells(cellsPart.trimEnd())
  return { cells, attrGroups: groups }
}

// ─── BlockParser ──────────────────────────────────────────────────────────────

export class BlockParser {
  readonly lines: string[]
  private pos: number = 0
  readonly insideContainer: boolean
  public diagnostics: Diagnostic[] = []

  constructor(lines: string[], insideContainer = false) {
    this.lines = lines
    this.insideContainer = insideContainer
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

  private buildPages(blocks: Block[]): Page[] {
    const pages: Page[] = [{ meta: null, children: [] }]
    for (const block of blocks) {
      if ((block as unknown as Record<string, unknown>)['type'] === 'Spacer') {
        pages[pages.length - 1]?.children.push(block)
      } else if (block.type === 'Meta') {
        const cur = pages[pages.length - 1]
        if (cur?.meta !== null) {
          pages.push({ meta: block as Meta, children: [] })
        } else {
          if (cur) cur.meta = block as Meta
        }
      } else if (block.type === 'ThematicBreak') {
        pages.push({ meta: null, children: [block] })
      } else {
        pages[pages.length - 1]?.children.push(block)
      }
    }
    return pages
  }

  // ── Block collection ──────────────────────────────────────────────────────

  parseBlocks(): Block[] {
    const blocks: Block[] = []
    while (this.pos < this.lines.length) {
      if (this.isBlank()) {
        blocks.push({ type: 'Spacer' } as unknown as Block)
        this.pos++
        continue
      }
      blocks.push(this.parseBlock())
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

  parseBlock(): Block {
    const raw = this.peek()
    const line = raw.trimStart()

    if (line.startsWith('```')) return this.parseCodeBlock()
    if (line.startsWith('~~~')) return this.parseMetaBlock()
    if (line.startsWith('$$$')) return this.parseMathBlock()
    if (line.startsWith('---')) return this.parseThematicBreak()
    if (line.startsWith('|')) return this.parseTable()
    if (line.startsWith('>')) return this.parseQuoteBlock()
    if (line.startsWith('![')) return this.parseImageBlock()
    if (line.startsWith('/')) return this.parseFileRef()
    if (line.startsWith('[^')) return this.parseRefDefinition()

    if (line.startsWith(':::')) {
      const rest = line.slice(3)
      if (rest.length > 0 && isIdStart(rest[0] || '')) return this.parseNamedBlock()
      this.advance()
      this.diagnostics.push({ code: 'CDN-0013', level: 'warning' })
      return { type: 'Paragraph', children: [{ type: 'Text', value: line }] }
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

  private parseCodeBlock(): Block {
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
      contentLines.push(l)
      this.pos++
    }
    if (!closed) {
      this.diagnostics.push({ code: 'CDN-0001', level: 'warning' })
      if (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') contentLines.pop()
    }

    const content = contentLines.join('\n')
    const node: CodeBlock = { type: 'CodeBlock', language, content }
    if (attrs) node.attributes = attrs
    return node
  }

  // ── MetaBlock ─────────────────────────────────────────────────────────────

  private parseMetaBlock(): Block {
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
      contentLines.push(l)
      this.pos++
    }
    if (!closed) {
      this.diagnostics.push({ code: 'CDN-0002', level: 'warning' })
    }

    if (this.insideContainer) {
      this.diagnostics.push({ code: 'CDN-0030', level: 'warning' })
      const rawText = rawSpanLines.join('\n')
      return { type: 'Paragraph', children: [{ type: 'Text', value: rawText }] }
    }

    while (contentLines.length > 0 && contentLines[contentLines.length - 1]?.trim() === '') contentLines.pop()
    const raw = contentLines.join('\n') + (contentLines.length > 0 ? '\n' : '')
    return { type: 'Meta', format, raw }
  }

  // ── MathBlock ─────────────────────────────────────────────────────────────

  private parseMathBlock(): Block {
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

    const formula = contentLines.join('\n')
    const node: MathBlock = { type: 'MathBlock', formula }
    if (attrs) node.attributes = attrs
    return node
  }

  // ── ThematicBreak ─────────────────────────────────────────────────────────

  private parseThematicBreak(): Block {
    const line = this.advance().trimStart()
    const rest = line.replace(/^-+/, '').trim()

    let attrs: Attribute[] | undefined
    if (rest !== '') {
      if (rest.startsWith('{')) {
        const r = parseAttrBlock(rest)
        if (r.attrs.length > 0) attrs = r.attrs
        this.diagnostics.push(...r.diagnostics)
      } else {
        this.diagnostics.push({ code: 'CDN-0010', level: 'warning' })
        const brace = rest.indexOf('{')
        if (brace >= 0) {
          const r = parseAttrBlock(rest.slice(brace))
          if (r.attrs.length > 0) attrs = r.attrs
          this.diagnostics.push(...r.diagnostics)
        }
      }
    }

    const node: ThematicBreak = { type: 'ThematicBreak' }
    if (attrs) node.attributes = attrs
    return node
  }

  // ── Heading / Section ─────────────────────────────────────────────────────

  private parseHeading(eqCount: number): Block {
    const rawLine = this.advance()
    const line = rawLine.trimStart()
    const lines: string[] = [line.slice(eqCount + 1)]

    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      lines.push(this.advance())
    }

    if (eqCount > 9) {
      this.diagnostics.push({ code: 'CDN-0012', level: 'warning' })
      return { type: 'Paragraph', children: [{ type: 'Text', value: line }] }
    }

    const level = eqCount
    const fullContent = lines.join('\n')

    const { nodes: heading, trailingAttrGroups, diagnostics } = parseInlineText(fullContent)
    this.diagnostics.push(...diagnostics)

    const node: Section = { type: 'Section', level, heading, children: [] }
    distributeScopeChain(trailingAttrGroups, [node, heading], this.diagnostics)
    return node
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  private parseTable(): Block {
    const tableLines: string[] = []
    while (this.pos < this.lines.length && this.lines[this.pos]?.trimStart().startsWith('|')) {
      tableLines.push(this.lines[this.pos++] || '')
    }

    const attrLines: string[] = []
    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      attrLines.push(this.advance())
    }

    const delimIdx = tableLines.findIndex((l) => isDelimiterRow(l))
    const isGfm = delimIdx === 1

    const columns: Column[] = []
    if (isGfm) {
      for (const cell of splitCells(tableLines[delimIdx] || '')) {
        columns.push({ type: 'Column', align: parseColumnAlign(cell.trim()) })
      }
    }

    const dataRows = tableLines.filter((_, i) => i !== delimIdx)
    const rowsData = dataRows.map((l) => parseTableRowLine(l))

    const colCount = Math.max(...rowsData.map((r) => r.cells.length), 0)
    if (!isGfm) {
      for (let i = 0; i < colCount; i++) columns.push({ type: 'Column', align: 'left' })
    }

    const rows: Row[] = rowsData.map((rd, rowIdx) => ({
      type: 'Row' as const,
      children: rd.cells.map((cellText, colIdx) => {
        const { nodes } = parseInlineText(cellText.trim())
        return { type: 'Cell' as const, children: nodes, row: rowIdx, column: colIdx }
      }),
    }))

    let head: Row[] | undefined
    let body: Row[] = rows
    if (isGfm && rows.length > 0) {
      head = rows[0] ? [rows[0]] : []
      body = rows.slice(1)
      body.forEach((r, i) => r.children.forEach((c) => { c.row = i }))
    }

    const table: Table = { type: 'Table', kind: isGfm ? 'gfm' : 'simple', body, columns }
    if (head) table.head = head

    const lastRowData = rowsData[rowsData.length - 1]
    let groups: Attribute[][] = lastRowData?.attrGroups ?? []
    if (attrLines.length > 0) {
      const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join('\n'))
      this.diagnostics.push(...diagnostics)
      groups = [...groups, ...trailingAttrGroups]
    }

    const slots: unknown[] = [table]
    if (rows.length > 0) slots.push(rows[rows.length - 1])

    distributeScopeChain(groups, slots, this.diagnostics)

    return table
  }

  // ── QuoteBlock ────────────────────────────────────────────────────────────

  private parseQuoteBlock(): Block {
    const contentLines: string[] = []
    let attrs: Attribute[] | undefined
    let firstLine = true

    while (this.pos < this.lines.length && this.lines[this.pos]?.trimStart().startsWith('>')) {
      const raw = this.lines[this.pos++]
      const line = raw?.trimStart() || ''
      const rest = line.slice(1)
      const stripped = rest.startsWith(' ') ? rest.slice(1) : rest

      if (firstLine) {
        const { text, groups, diagnostics: attrDiags } = extractTrailingAttrGroups(stripped)
        this.diagnostics.push(...attrDiags)
        if (groups.length > 0) {
          distributeScopeChain(groups, [{ attributes: undefined }], this.diagnostics)
          const aa = groups[groups.length - 1]
          attrs = aa && aa.length > 0 ? groups[groups.length - 1] : undefined
        }
        contentLines.push(text)
        firstLine = false
      } else {
        contentLines.push(stripped)
      }
    }

    const sub = new BlockParser(contentLines, true)
    const children = sub.parseBlocks()
    this.diagnostics.push(...sub.diagnostics)
    const node: QuoteBlock = { type: 'QuoteBlock', children }
    if (attrs) node.attributes = attrs
    return node
  }

  // ── List ──────────────────────────────────────────────────────────────────

  private parseList(): Block {
    const raw = this.peek()
    const stripped = raw.trimStart()
    const col = raw.length - stripped.length
    return this.parseListAtCol(col)
  }

  private parseListAtCol(col: number): List {
    const firstStripped = this.peek().trimStart()
    const ordered = /^\d+\. /.test(firstStripped)
    const list: List = { type: 'List', ordered, loose: false, children: [] }
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

      const result = this.parseListItemAtCol(col)
      list.children.push(result.item)
      if (result.absorbedBlank) list.loose = true
      if (firstStart === undefined && result.start !== undefined) {
        firstStart = result.start
        list.start = firstStart
      }
      if (result.attrGroups && result.attrGroups.length > 0) {
        distributeScopeChain(result.attrGroups, [list, result.item, (result.item as unknown as Record<string, unknown>)['children']], this.diagnostics)
      }
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
    if (firstStripped.startsWith('- [ ] ')) {
      markerLen = 6
      checked = false
    } else if (firstStripped.startsWith('- [x] ') || firstStripped.startsWith('- [X] ')) {
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

      if (i > 0 && isListMarkerLine(stripped)) {
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

  private parseImageBlock(): Block {
    const line = this.advance().trimStart()
    const m = line.match(/^!\[([^\]]*)\]\(([^)]*)\)(.*)?$/)
    if (!m) {
      const { nodes } = parseInlineText(line)
      return { type: 'Paragraph', children: nodes }
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
    const node: ImageBlock = { type: 'ImageBlock', alt, src }

    ;(node as unknown as Record<string, unknown>)['attrGroups'] = trailingAttrGroups
    distributeScopeChain(trailingAttrGroups, [node, alt], this.diagnostics)

    return node
  }

  // ── FileRef ───────────────────────────────────────────────────────────────

  private parseFileRef(): Block {
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

    let fragment: string | undefined
    const hashIdx = src.indexOf('#')
    if (hashIdx >= 0) {
      fragment = src.slice(hashIdx + 1)
      src = src.slice(0, hashIdx)
    }
    src = '/' + src

    const group = detectFileGroup(src) ?? null
    const node: FileRef = { type: 'FileRef', src, fragment: fragment ?? null, group }

    ;(node as unknown as Record<string, unknown>)['attrGroups'] = finalGroups
    distributeScopeChain(finalGroups, [node], this.diagnostics)

    return node
  }

  // ── RefDefinition ─────────────────────────────────────────────────────────

  private parseRefDefinition(): Block {
    const line = this.advance().trimStart()
    const m = line.match(/^\[\^([^\]]+)\]:\s*(.*)/)
    if (!m) {
      const { nodes } = parseInlineText(line)
      return { type: 'Paragraph', children: nodes }
    }
    const id = m[1] || '',
      content = m[2] || ''
    const { nodes: children } = parseInlineText(content)
    return { type: 'RefDefinition', id, children }
  }

  // ── NamedBlock ────────────────────────────────────────────────────────────

  private parseNamedBlock(): Block {
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

    const { trailingAttrGroups, diagnostics: attrDiags } = parseInlineText(openerAttrLines.join('\n'))
    this.diagnostics.push(...attrDiags)

    const node: NamedBlock = { type: 'NamedBlock', name, children: [] }
    distributeScopeChain(trailingAttrGroups, [node], this.diagnostics)

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

  // ── Paragraph ─────────────────────────────────────────────────────────────

  private parseParagraph(): Block {
    const paraLines: string[] = []
    while (this.pos < this.lines.length && this.lines[this.pos]?.trim() !== '') {
      if (paraLines.length > 0 && this.peek().trim().startsWith('{')) break
      paraLines.push(this.lines[this.pos++] || '')
    }

    const attrLines: string[] = []
    while (this.pos < this.lines.length && this.peek().trim().startsWith('{')) {
      attrLines.push(this.advance())
    }

    const joined = paraLines.map((l, idx) => (idx === 0 ? l : l.trimStart())).join('\n')

    const { nodes, trailingAttrGroups, diagnostics } = parseInlineText(joined)
    this.diagnostics.push(...diagnostics)

    let groups = trailingAttrGroups
    if (attrLines.length > 0) {
      const pr = parseInlineText(attrLines.join('\n'))
      this.diagnostics.push(...pr.diagnostics)
      groups = [...groups, ...pr.trailingAttrGroups]
    }

    const node: Paragraph = { type: 'Paragraph', children: nodes }
    distributeScopeChain(groups, [node, nodes], this.diagnostics)
    return node
  }
}
