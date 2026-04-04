import type { Document, Page, Block, Section, Paragraph, QuoteBlock, List, ListItem, TaskItem, Table, Row, Cell, FileRefGroup, ImageBlock, NamedBlock, RefDefinition } from '../types/document/blocks.ts'
import type { Inline, Emphasis, Strong, Strikethrough, Link, ImageInline, Span, QuoteInline } from '../types/document/inline.ts'
import type { Visitors } from './types.ts'
import type { NodeMap } from '../types/document/node-map.ts'

// ─── Internal traversal ───────────────────────────────────────────────────────

type V = Visitors<NodeMap>

/** Visit an array of inlines in-place (exit-only). */
function visitInlines(nodes: Inline[], v: V): void {
  for (let i = 0; i < nodes.length; i++) {
    const result = visitInline(nodes[i]!, v)
    if (result !== undefined) nodes[i] = result
  }
}

/** Visit one inline node (exit-only: recurse into children, then call visitor). */
function visitInline(node: Inline, v: V): Inline | undefined {
  switch (node.type) {
    case 'Emphasis': {
      visitInlines((node as Emphasis).children, v)
      return v.Emphasis?.(node as Emphasis) as Inline | undefined
    }
    case 'Strong': {
      visitInlines((node as Strong).children, v)
      return v.Strong?.(node as Strong) as Inline | undefined
    }
    case 'Strikethrough': {
      visitInlines((node as Strikethrough).children, v)
      return v.Strikethrough?.(node as Strikethrough) as Inline | undefined
    }
    case 'Link': {
      visitInlines((node as Link).children, v)
      return v.Link?.(node as Link) as Inline | undefined
    }
    case 'ImageInline': {
      visitInlines((node as ImageInline).alt, v)
      return v.ImageInline?.(node as ImageInline) as Inline | undefined
    }
    case 'Span': {
      visitInlines((node as Span).children, v)
      return v.Span?.(node as Span) as Inline | undefined
    }
    case 'QuoteInline': {
      visitInlines((node as QuoteInline).children, v)
      return v.QuoteInline?.(node as QuoteInline) as Inline | undefined
    }
    case 'Text':        return v.Text?.(node) as Inline | undefined
    case 'CodeInline':  return v.CodeInline?.(node) as Inline | undefined
    case 'TextBreak':   return v.TextBreak?.(node) as Inline | undefined
    case 'MathInline':  return v.MathInline?.(node) as Inline | undefined
    case 'Variable':    return v.Variable?.(node) as Inline | undefined
  }
}

/** Visit an array of blocks in-place (exit-only). */
function visitBlocks(nodes: Block[], v: V): void {
  for (let i = 0; i < nodes.length; i++) {
    const result = visitBlock(nodes[i]!, v)
    if (result !== undefined) nodes[i] = result
  }
}

/** Visit one block node (exit-only: recurse into children, then call visitor). */
function visitBlock(node: Block, v: V): Block | undefined {
  switch (node.type) {
    case 'Section': {
      visitInlines((node as Section).heading, v)
      visitBlocks((node as Section).children, v)
      return v.Section?.(node as Section) as Block | undefined
    }
    case 'Paragraph': {
      visitInlines((node as Paragraph).children, v)
      return v.Paragraph?.(node as Paragraph) as Block | undefined
    }
    case 'QuoteBlock': {
      visitBlocks((node as QuoteBlock).children, v)
      return v.QuoteBlock?.(node as QuoteBlock) as Block | undefined
    }
    case 'List': {
      const list = node as List
      for (let i = 0; i < list.children.length; i++) {
        const item = list.children[i]!
        visitListItem(item, v)
      }
      return v.List?.(list) as Block | undefined
    }
    case 'Table': {
      const table = node as Table
      for (const col of table.columns) {
        const r = v.Column?.(col)
        if (r !== undefined) Object.assign(col, r)
      }
      if (table.head) visitRows(table.head, v)
      visitRows(table.body, v)
      return v.Table?.(table) as Block | undefined
    }
    case 'FileRefGroup': {
      const grp = node as FileRefGroup
      for (let i = 0; i < grp.children.length; i++) {
        const child = grp.children[i]!
        if (child.type === 'FileRef') {
          const r = v.FileRef?.(child)
          if (r !== undefined) grp.children[i] = r
        } else {
          visitInlines((child as ImageBlock).alt, v)
          const r = v.ImageBlock?.(child as ImageBlock)
          if (r !== undefined) grp.children[i] = r
        }
      }
      return v.FileRefGroup?.(grp) as Block | undefined
    }
    case 'NamedBlock': {
      visitBlocks((node as NamedBlock).children, v)
      return v.NamedBlock?.(node as NamedBlock) as Block | undefined
    }
    case 'RefDefinition': {
      visitInlines((node as RefDefinition).children, v)
      return v.RefDefinition?.(node as RefDefinition) as Block | undefined
    }
    case 'ImageBlock': {
      visitInlines((node as ImageBlock).alt, v)
      return v.ImageBlock?.(node as ImageBlock) as Block | undefined
    }
    case 'ThematicBreak': return v.ThematicBreak?.(node) as Block | undefined
    case 'CodeBlock':     return v.CodeBlock?.(node) as Block | undefined
    case 'Meta':          return v.Meta?.(node) as Block | undefined
    case 'FileRef':       return v.FileRef?.(node) as Block | undefined
    case 'MathBlock':     return v.MathBlock?.(node) as Block | undefined
  }
}

function visitListItem(item: List['children'][number], v: V): void {
  const children = (item as ListItem | TaskItem).children
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    if (isBlock(child)) {
      const r = visitBlock(child as Block, v)
      if (r !== undefined) children[i] = r
    } else {
      const r = visitInline(child as Inline, v)
      if (r !== undefined) children[i] = r
    }
  }
  if (item.type === 'ListItem') {
    v.ListItem?.(item as ListItem)
  } else {
    v.TaskItem?.(item as TaskItem)
  }
}

function visitRows(rows: Row[], v: V): void {
  for (const row of rows) {
    for (const cell of row.children) {
      visitInlines(cell.children, v)
      v.Cell?.(cell as Cell)
    }
    v.Row?.(row)
  }
}

function isBlock(node: Block | Inline): boolean {
  const blockTypes = new Set([
    'Section', 'Paragraph', 'ThematicBreak', 'CodeBlock', 'Meta',
    'QuoteBlock', 'List', 'Table', 'FileRef', 'ImageBlock', 'FileRefGroup',
    'NamedBlock', 'RefDefinition', 'MathBlock',
  ])
  return blockTypes.has((node as { type: string }).type)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Walk the entire Document tree with exit-only visitors (children before parent). */
export function walkDocument(doc: Document, visitors: V): void {
  for (const page of doc.children) {
    walkPage(page, visitors)
  }
}

function walkPage(page: Page, v: V): void {
  if (page.meta !== null) {
    v.Meta?.(page.meta)
  }
  visitBlocks(page.children, v)
}
