import type { Attribute, LineReflection, PathResourceLocator, SegmentReflection } from './common.ts'
import type { Inline } from './inline.ts'

// ─── Document / Page ─────────────────────────────────────────────────────────

export interface Document {
  _type: 'Document'
  children: Page[]
}

export interface Page {
  _type: 'Page'
  meta: Meta | null
  /** §7.3: every CommentBlock and orphan `##` line on the Page, at any depth, in source order */
  reflections: SegmentReflection[]
  children: Block[]
}

// ─── Block union ──────────────────────────────────────────────────────────────

export type Block =
  | Paragraph
  | Section
  | CodeBlock
  | MathBlock
  | QuoteBlock
  | List
  | Table
  | FileGroup
  | EmbedBlock
  | InjectBlock
  | NamedBlock
  | SpoilerBlock
  | RefDefinition

// ─── Block nodes ──────────────────────────────────────────────────────────────

export interface Paragraph {
  _type: 'Paragraph'
  children: Inline[]
  attributes: Attribute[]
  reflections: LineReflection[]
}

export type SectionLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface Section {
  _type: 'Section'
  level: SectionLevel
  heading: Inline[]
  children: Block[]
  attributes: Attribute[]
  reflections: LineReflection[]
}

export type MetaFormat = 'yaml' | 'toml' | 'json'

/** §4.3: fills `Page.meta`; never appears in `Page.children`. */
export interface Meta {
  _type: 'Meta'
  format: MetaFormat
  raw: string
}

export interface CodeBlock {
  _type: 'CodeBlock'
  language: string
  raw: string
  attributes: Attribute[]
  caption: Inline[]
  reflections: LineReflection[]
}

export interface MathBlock {
  _type: 'MathBlock'
  raw: string
  attributes: Attribute[]
  caption: Inline[]
  reflections: LineReflection[]
}

/** §4.6: a body that parses to exactly one Paragraph is held as its `Inline[]`. */
export interface QuoteBlock {
  _type: 'QuoteBlock'
  children: Inline[] | Block[]
  attributes: Attribute[]
  caption: Inline[]
  reflections: LineReflection[]
}

export type ListItemLike = ListItem | TaskItem

export interface List {
  _type: 'List'
  kind: 'bullet' | 'numbered' | 'checklist'
  /** first item number for kind "numbered"; 1 otherwise */
  start: number
  loose: boolean
  children: ListItemLike[]
  attributes: Attribute[]
}

export interface ListItem {
  _type: 'ListItem'
  children: Inline[] | Block[]
  attributes: Attribute[]
  reflections: LineReflection[]
}

export interface TaskItem {
  _type: 'TaskItem'
  checked: boolean
  children: Inline[] | Block[]
  attributes: Attribute[]
  reflections: LineReflection[]
}

export type ColumnAlign = 'start' | 'left' | 'right' | 'center' | 'comma' | 'decimal'

export interface Column {
  _type: 'Column'
  align: ColumnAlign
}

export interface Cell {
  _type: 'Cell'
  children: Inline[]
  row: number
  column: number
}

export interface Row {
  _type: 'Row' | 'Header'
  children: Cell[]
  attributes: Attribute[]
  reflections: LineReflection[]
}

export interface Table {
  _type: 'Table'
  rows: Row[]
  columns: Column[]
  attributes: Attribute[]
  caption: Inline[]
}

/** §4.11: only ever a child of a FileGroup. */
export interface FileBlock {
  _type: 'FileBlock'
  raw: string
  src: PathResourceLocator | null
  attributes: Attribute[]
  caption: Inline[]
  reflections: LineReflection[]
}

export interface FileGroup {
  _type: 'FileGroup'
  children: FileBlock[]
  attributes: Attribute[]
}

export interface EmbedBlock {
  _type: 'EmbedBlock'
  url: string
  attributes: Attribute[]
  caption: Inline[]
  reflections: LineReflection[]
}

/** §4.17: the parser always emits `children: []`; a consumer fills it (§9). */
export interface InjectBlock {
  _type: 'InjectBlock'
  raw: string
  src: PathResourceLocator | null
  children: Block[]
  attributes: Attribute[]
  reflections: LineReflection[]
}

export interface NamedBlock {
  _type: 'NamedBlock'
  name: string
  children: Inline[] | Block[]
  attributes: Attribute[]
  caption: Inline[]
  reflections: LineReflection[]
}

export interface SpoilerBlock {
  _type: 'SpoilerBlock'
  children: Inline[] | Block[]
  attributes: Attribute[]
  caption: Inline[]
  reflections: LineReflection[]
}

export interface RefDefinition {
  _type: 'RefDefinition'
  ref: string
  children: Inline[]
  attributes: Attribute[]
  reflections: LineReflection[]
}
