import type { Document, Page, Block, ListItemLike, Row } from '../types/document/blocks.ts'
import type { Inline } from '../types/document/inline.ts'
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
  switch (node._type) {
    case 'Emphasis':
      visitInlines(node.children, v)
      return v.Emphasis?.(node) as Inline | undefined
    case 'Strong':
      visitInlines(node.children, v)
      return v.Strong?.(node) as Inline | undefined
    case 'Highlight':
      visitInlines(node.children, v)
      return v.Highlight?.(node) as Inline | undefined
    case 'Spoiler':
      visitInlines(node.children, v)
      return v.Spoiler?.(node) as Inline | undefined
    case 'Link':
      visitInlines(node.children, v)
      return v.Link?.(node) as Inline | undefined
    case 'QuoteInline':
      visitInlines(node.children, v)
      return v.QuoteInline?.(node) as Inline | undefined
    case 'Mark':
      visitInlines(node.children, v)
      return v.Mark?.(node) as Inline | undefined
    case 'ImageInline':
      visitInlines(node.alt, v)
      return v.ImageInline?.(node) as Inline | undefined
    case 'EmbedImageInline':
      visitInlines(node.alt, v)
      return v.EmbedImageInline?.(node) as Inline | undefined
    case 'Text':
      return v.Text?.(node) as Inline | undefined
    case 'CodeInline':
      return v.CodeInline?.(node) as Inline | undefined
    case 'LineBreak':
      return v.LineBreak?.(node) as Inline | undefined
    case 'MathInline':
      return v.MathInline?.(node) as Inline | undefined
    case 'Variable':
      return v.Variable?.(node) as Inline | undefined
  }
}

/** Visit an array of blocks in-place (exit-only). */
function visitBlocks(nodes: Block[], v: V): void {
  for (let i = 0; i < nodes.length; i++) {
    const result = visitBlock(nodes[i]!, v)
    if (result !== undefined) nodes[i] = result
  }
}

/**
 * §4.7.1: a container holds `Inline[]` when its body is one paragraph and
 * `Block[]` otherwise; the two never mix, so the first child decides.
 */
function visitBody(children: Inline[] | Block[], v: V): void {
  if (children.length > 0 && isInline(children[0]!)) visitInlines(children as Inline[], v)
  else visitBlocks(children as Block[], v)
}

const INLINE_TYPES = new Set([
  'Text',
  'Emphasis',
  'Strong',
  'Highlight',
  'Spoiler',
  'Link',
  'CodeInline',
  'MathInline',
  'QuoteInline',
  'ImageInline',
  'EmbedImageInline',
  'Mark',
  'LineBreak',
  'Variable',
])

const isInline = (node: Inline | Block): node is Inline => INLINE_TYPES.has(node._type)

/** Visit one block node (exit-only: recurse into children, then call visitor). */
function visitBlock(node: Block, v: V): Block | undefined {
  switch (node._type) {
    case 'Section':
      visitInlines(node.heading, v)
      visitBlocks(node.children, v)
      return v.Section?.(node) as Block | undefined
    case 'Paragraph':
      visitInlines(node.children, v)
      return v.Paragraph?.(node) as Block | undefined
    case 'QuoteBlock':
      visitBody(node.children, v)
      visitInlines(node.caption, v)
      return v.QuoteBlock?.(node) as Block | undefined
    case 'NamedBlock':
      visitBody(node.children, v)
      visitInlines(node.caption, v)
      return v.NamedBlock?.(node) as Block | undefined
    case 'SpoilerBlock':
      visitBody(node.children, v)
      visitInlines(node.caption, v)
      return v.SpoilerBlock?.(node) as Block | undefined
    case 'List':
      for (const item of node.children) visitListItem(item, v)
      return v.List?.(node) as Block | undefined
    case 'Table':
      for (const col of node.columns) {
        const r = v.Column?.(col)
        if (r !== undefined) Object.assign(col, r)
      }
      visitRows(node.rows, v)
      visitInlines(node.caption, v)
      return v.Table?.(node) as Block | undefined
    case 'FileGroup':
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]!
        visitInlines(child.caption, v)
        const r = v.FileBlock?.(child)
        if (r !== undefined) node.children[i] = r
      }
      return v.FileGroup?.(node) as Block | undefined
    case 'InjectBlock':
      visitBlocks(node.children, v)
      return v.InjectBlock?.(node) as Block | undefined
    case 'RefDefinition':
      visitInlines(node.children, v)
      return v.RefDefinition?.(node) as Block | undefined
    case 'CodeBlock':
      visitInlines(node.caption, v)
      return v.CodeBlock?.(node) as Block | undefined
    case 'MathBlock':
      visitInlines(node.caption, v)
      return v.MathBlock?.(node) as Block | undefined
    case 'EmbedBlock':
      visitInlines(node.caption, v)
      return v.EmbedBlock?.(node) as Block | undefined
  }
}

function visitListItem(item: ListItemLike, v: V): void {
  visitBody(item.children, v)
  if (item._type === 'ListItem') v.ListItem?.(item)
  else v.TaskItem?.(item)
}

function visitRows(rows: Row[], v: V): void {
  for (const row of rows) {
    for (const cell of row.children) {
      visitInlines(cell.children, v)
      v.Cell?.(cell)
    }
    v.Row?.(row)
  }
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
