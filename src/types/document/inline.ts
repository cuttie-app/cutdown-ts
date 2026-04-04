import type { Attribute } from './common.ts'

// ─── Inline parse result ──────────────────────────────────────────────────────

export interface InlineParseResult {
  nodes: Inline[]
  /** Trailing attribute groups for scope-chain distribution (left-to-right order) */
  trailingAttrGroups: Attribute[][]
  diagnostics: import('./common.ts').Diagnostic[]
}

// ─── Inline union ─────────────────────────────────────────────────────────────

export type Inline =
  | Text
  | Emphasis
  | Strong
  | Strikethrough
  | CodeInline
  | TextBreak
  | Link
  | ImageInline
  | Span
  | MathInline
  | Variable
  | Mention
  | QuoteInline

// ─── Inline nodes ─────────────────────────────────────────────────────────────

export interface Text {
  type: 'Text'
  value: string
}

export interface Emphasis {
  type: 'Emphasis'
  children: Inline[]
  attributes?: Attribute[]
}

export interface Strong {
  type: 'Strong'
  children: Inline[]
  attributes?: Attribute[]
}

export interface Strikethrough {
  type: 'Strikethrough'
  children: Inline[]
  attributes?: Attribute[]
}

export interface CodeInline {
  type: 'CodeInline'
  value: string
  attributes?: Attribute[]
}

export interface TextBreak {
  type: 'TextBreak'
}

export type LinkKind = 'external' | 'page' | 'tag' | 'ref' | 'cite'

export interface Link {
  type: 'Link'
  kind: LinkKind
  href?: string
  target?: string
  children: Inline[]
  attributes?: Attribute[]
}

export interface ImageInline {
  type: 'ImageInline'
  alt: Inline[]
  src: string
  attributes?: Attribute[]
}

export interface Span {
  type: 'Span'
  name: string
  attributes?: Attribute[]
  children: Inline[]
}

export interface MathInline {
  type: 'MathInline'
  formula: string
  attributes?: Attribute[]
}

export interface Variable {
  type: 'Variable'
  key: string
  attributes?: Attribute[]
}

export interface Mention {
  type: 'Mention'
  value: string
  attributes?: Attribute[]
}

export interface QuoteInline {
  type: 'QuoteInline'
  kind: 'double' | 'single'
  children: Inline[]
  attributes?: Attribute[]
}
