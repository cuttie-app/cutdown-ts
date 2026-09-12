import type { Attribute } from './common.ts'
import type { Inline } from './inline.ts'

// ─── Reflection ───────────────────────────────────────────────────────────────

export interface Loc {
  start: number
  end: number
}

export interface Reflection {
  /** Source range of the `##` payload — raw-file UTF-16 code-unit offsets, end-exclusive */
  loc?: Loc
  text: string
}

// ─── Document / Page ─────────────────────────────────────────────────────────

export interface Document {
  type: 'Document'
  children: Page[]
}

export interface Page {
  meta: Meta | null
  children: Block[]
}

// ─── Parse result ─────────────────────────────────────────────────────────────

// ─── Block union ──────────────────────────────────────────────────────────────

export type Block =
  | Section
  | Paragraph
  | CodeBlock
  | QuoteBlock
  | List
  | Table
  | FileRef
  | ImageBlock
  | FileRefGroup
  | NamedBlock
  | RefDefinition
  | MathBlock
  | SpoilerBlock
  | CommentBlock

/**
 * A block as it exists *during* parsing. `PageBreak` and `Meta` are consumed by
 * the pagination fold (§9.5.2) — a `PageBreak` reaches no consumer at all, and a
 * `Meta` reaches one only through `Page.meta` — so neither is a `Block`.
 */
export type ParseBlock = Block | PageBreak | Meta

/**
 * §14.5: a synthetic segment. No parse produces a `Fragment` — a consumer that
 * materializes a transclusion does — but a conforming consumer must accept one.
 */
export interface Fragment {
  type: 'Fragment'
  meta: Meta | null
  children: Block[]
}

export interface CommentBlock {
  type: 'CommentBlock'
  text: string
  reflection?: Reflection[]
}

// ─── Block nodes ──────────────────────────────────────────────────────────────

export type SectionLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface Section {
  type: 'Section'
  level: SectionLevel
  heading: Inline[]
  attributes: Attribute[]
  children: Block[]
  reflection?: Reflection[]
}

export interface Paragraph {
  type: 'Paragraph'
  children: Inline[]
  attributes: Attribute[]
  reflection?: Reflection[]
}

/**
 * Internal pagination marker for a top-level `---` line. Consumed by the
 * pagination fold — it never appears in the emitted Document tree.
 */
export interface PageBreak {
  type: 'PageBreak'
}

export interface CodeBlock {
  type: 'CodeBlock'
  language: string
  raw: string
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}

export type MetaFormat = 'yaml' | 'toml' | 'json'

export interface Meta {
  type: 'Meta'
  format: MetaFormat
  raw: string
}

export interface QuoteBlock {
  type: 'QuoteBlock'
  children: Block[]
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}

export type ListItemLike = ListItem | TaskItem

export interface List {
  type: 'List'
  kind: 'bullet' | 'numbered' | 'checklist'
  start: number | null
  loose: boolean
  children: ListItemLike[]
  attributes: Attribute[]
  reflection?: Reflection[]
}

export interface ListItem {
  type: 'ListItem'
  children: (Block | Inline)[]
  attributes: Attribute[]
}

export interface TaskItem {
  type: 'TaskItem'
  checked: boolean
  children: (Block | Inline)[]
  attributes: Attribute[]
}

export type ColumnAlign = 'start' | 'left' | 'right' | 'center' | 'comma' | 'decimal'

export interface Column {
  type: 'Column'
  align: ColumnAlign
}

export interface Cell {
  type: 'Cell'
  children: Inline[]
  row: number
  column: number
}

export interface Row {
  type: 'Row' | 'Header'
  children: Cell[]
  attributes: Attribute[]
}

export interface Table {
  type: 'Table'
  rows: Row[]
  columns: Column[]
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}

export type FileGroup = 'image' | 'video' | 'audio'

export interface FileRef {
  type: 'FileRef'
  path: string
  query: string
  fragment: string
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}

export interface ImageBlock {
  type: 'ImageBlock'
  alt: Inline[]
  src: string
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}

export interface FileRefGroup {
  type: 'FileRefGroup'
  group: FileGroup
  children: (FileRef | ImageBlock)[]
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}

export interface NamedBlock {
  type: 'NamedBlock'
  name: string
  children: Block[]
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}

export interface RefDefinition {
  type: 'RefDefinition'
  ref: string
  children: Inline[]
  attributes: Attribute[]
  reflection?: Reflection[]
}

export interface MathBlock {
  type: 'MathBlock'
  raw: string
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}

export interface SpoilerBlock {
  type: 'SpoilerBlock'
  children: Block[]
  attributes: Attribute[]
  caption?: Inline[]
  reflection?: Reflection[]
}
