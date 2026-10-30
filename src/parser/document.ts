import type { Block, Document, ListItemLike, Page, Paragraph } from '../types/document'
import { mergeAttrs } from './attrs.ts'
import { type ParseState, type SeqItem, Scope, finishSequence, isBlockNode } from './block.ts'
import { distribute } from './inline.ts'
import { splitLines } from './lines.ts'

type Container = Extract<Block, { _type: 'QuoteBlock' | 'NamedBlock' | 'SpoilerBlock' }> | ListItemLike

const newPage = (): Page => ({ _type: 'Page', meta: null, reflections: [], children: [] })

/** Parse a whole input into a Document (§3, §16). */
export function parseDocument(input: string, st: ParseState): Document {
  const root = new Scope(splitLines(input), 0, true, st).parse()
  if (root.tail) distribute(root.tail.groups, root.tail.slots, st.diagnostics)
  const pages = paginate(root.items, st)

  const hoisted = new Map<object, Container>()
  for (const page of pages) shape(page.children, hoisted)
  anchor(pages, st, hoisted)
  return { _type: 'Document', children: pages }
}

/**
 * §16.2 pagination fold. A PageBreaker always opens a new Page; a Meta fills
 * the current Page's empty slot, or opens a new Page when the slot is taken.
 */
function paginate(items: SeqItem[], st: ParseState): Page[] {
  const pages = [newPage()]
  let cur = pages[0]!
  let pageItems: SeqItem[] = []
  const close = () => {
    cur.children = finishSequence(pageItems, cur, st)
    pageItems = []
  }
  for (const it of items) {
    if (it._type === '#pagebreak') {
      close()
      cur = newPage()
      pages.push(cur)
    } else if (it._type === 'Meta') {
      if (cur.meta === null) cur.meta = it
      else {
        close()
        cur = { ...newPage(), meta: it }
        pages.push(cur)
      }
    } else pageItems.push(it)
  }
  close()
  return pages
}

/**
 * §4.7.1, §4.6: a container whose body is exactly one Paragraph holds that
 * paragraph's inline content; its attributes and reflections move up.
 */
function shape(blocks: Block[], hoisted: Map<object, Container>): void {
  for (const b of blocks) {
    switch (b._type) {
      case 'Section':
        shape(b.children, hoisted)
        break
      case 'QuoteBlock':
      case 'NamedBlock':
      case 'SpoilerBlock':
        shape(b.children as Block[], hoisted)
        hoist(b, hoisted)
        break
      case 'List':
        for (const item of b.children) {
          shape(item.children as Block[], hoisted)
          hoist(item, hoisted)
        }
        break
    }
  }
}

function hoist(c: Container, hoisted: Map<object, Container>): void {
  const kids = c.children as Block[]
  if (kids.length !== 1 || kids[0]!._type !== 'Paragraph') return
  const p = kids[0] as Paragraph
  c.children = p.children
  c.attributes = mergeAttrs(c.attributes, p.attributes)
  c.reflections = [...c.reflections, ...p.reflections].sort((a, b) => a.loc.start - b.loc.start)
  hoisted.set(p, c)
}

/** Children of a node that are themselves blocks, for child-index paths (§7.3). */
function blockChildren(n: object): Block[] | null {
  const b = n as Block | ListItemLike
  switch (b._type) {
    case 'Section':
    case 'QuoteBlock':
    case 'NamedBlock':
    case 'SpoilerBlock':
    case 'ListItem':
    case 'TaskItem':
    case 'InjectBlock':
      return (b.children as unknown[]).every(isBlockNode) ? (b.children as Block[]) : null
    default:
      return null
  }
}

/** §7.3: give every segment comment its Page and its `before` path. */
function anchor(pages: Page[], st: ParseState, hoisted: Map<object, Container>): void {
  const where = new Map<object, { page: Page; path: number[] }>()
  const walk = (page: Page, nodes: object[], base: number[]) => {
    nodes.forEach((n, idx) => {
      const path = [...base, idx]
      where.set(n, { page, path })
      if ((n as Block)._type === 'List') walk(page, (n as Extract<Block, { _type: 'List' }>).children, path)
      const kids = blockChildren(n)
      if (kids) walk(page, kids, path)
    })
  }
  for (const page of pages) {
    where.set(page, { page, path: [] })
    walk(page, page.children, [])
  }

  const inlineBodies = new Set<object>(hoisted.values())
  for (const c of st.comments) {
    let at: { page: Page; path: number[] } | undefined
    if (c.next) {
      at = where.get(c.next)
      const owner = hoisted.get(c.next)
      if (!at && owner) {
        const o = where.get(owner)
        if (o) at = { page: o.page, path: [...o.path, 0] }
      }
    } else {
      const o = where.get(c.owner)
      if (o) {
        const kids = c.owner === o.page ? o.page.children : ((c.owner as Container).children as unknown[])
        // A body held as Inline[] counts as one block (§7.3 rule 4).
        const len = inlineBodies.has(c.owner) ? 1 : kids.length
        at = { page: o.page, path: [...o.path, len] }
      }
    }
    if (at) at.page.reflections.push({ loc: c.loc, text: c.text, before: at.path })
  }
  for (const page of pages) page.reflections.sort((a, b) => a.loc.start - b.loc.start)
}
