import type { Attribute, Diagnostic } from './common.ts'
import type { Inline } from './inline.ts'

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

export interface ParseResult {
  ast: Document
  diagnostics: Diagnostic[]
}

// ─── Block union ──────────────────────────────────────────────────────────────

export type Block =
  | Section
  | Paragraph
  | ThematicBreak
  | CodeBlock
  | Meta
  | QuoteBlock
  | List
  | Table
  | FileRef
  | ImageBlock
  | FileRefGroup
  | NamedBlock
  | RefDefinition
  | MathBlock

// ─── Block nodes ──────────────────────────────────────────────────────────────

export interface Section {
  type: 'Section'
  level: number
  heading: Inline[]
  attributes: Attribute[]
  children: Block[]
}

export interface Paragraph {
  type: 'Paragraph'
  children: Inline[]
  attributes: Attribute[]
}

export interface ThematicBreak {
  type: 'ThematicBreak'
  attributes: Attribute[]
}

export interface CodeBlock {
  type: 'CodeBlock'
  language: string
  raw: string
  attributes: Attribute[]
}

export interface Meta {
  type: 'Meta'
  format: string
  raw: string
}

export interface QuoteBlock {
  type: 'QuoteBlock'
  children: Block[]
  attributes: Attribute[]
}

export type ListItemLike = ListItem | TaskItem

export interface List {
  type: 'List'
  kind: 'bullet' | 'numbered' | 'checklist'
  start: number | null
  loose: boolean
  children: ListItemLike[]
  attributes: Attribute[]
}

export interface ListItem {
  type: 'ListItem'
  children: (Block | Inline)[]
  attributes?: Attribute[]
}

export interface TaskItem {
  type: 'TaskItem'
  checked: boolean
  children: (Block | Inline)[]
  attributes: Attribute[]
}

export type TableKind = 'simple' | 'gfm'
export type ColumnAlign = 'left' | 'right' | 'center' | 'comma' | 'decimal'

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
  type: 'Row'
  children: Cell[]
  attributes: Attribute[]
}

export interface Table {
  type: 'Table'
  kind: TableKind
  head: Row[]
  body: Row[]
  columns: Column[]
  attributes: Attribute[]
}

export type FileGroup = 'image' | 'video' | 'audio'

export interface FileRef {
  type: 'FileRef'
  path: string
  query: string
  fragment: string
  attributes: Attribute[]
}

export interface ImageBlock {
  type: 'ImageBlock'
  alt: Inline[]
  src: string
  attributes: Attribute[]
}

export interface FileRefGroup {
  type: 'FileRefGroup'
  group: FileGroup
  children: (FileRef | ImageBlock)[]
  attributes: Attribute[]
}

export interface NamedBlock {
  type: 'NamedBlock'
  name: string
  children: Block[]
  attributes: Attribute[]
}

export interface RefDefinition {
  type: 'RefDefinition'
  id: string
  children: Inline[]
  attributes: Attribute[]
}

export interface MathBlock {
  type: 'MathBlock'
  raw: string
  attributes: Attribute[]
}
