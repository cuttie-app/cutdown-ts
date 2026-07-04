import type { Attribute, Diagnostic } from './common.ts'

// ─── Inline parse result ──────────────────────────────────────────────────────

export interface InlineParseResult {
  nodes: Inline[]
  /** Trailing attribute groups for scope-chain distribution (left-to-right order) */
  trailingAttrGroups: Attribute[][]
  diagnostics: Diagnostic[]
  /** `##` comments extracted from the inline text; block parser attaches them to reflection */
  comments: { lineOffset: number; text: string }[]
}

// ─── Inline union ─────────────────────────────────────────────────────────────

export type Inline =
  | Text
  | Emphasis
  | Strong
  | Highlight
  | CodeInline
  | TextBreak
  | Link
  | ImageInline
  | Span
  | MathInline
  | Variable
  | QuoteInline
  | Spoiler

// ─── Inline nodes ─────────────────────────────────────────────────────────────

export interface Text {
  type: 'Text'
  value: string
}

export interface Emphasis {
  type: 'Emphasis'
  children: Inline[]
  attributes: Attribute[]
}

export interface Strong {
  type: 'Strong'
  children: Inline[]
  attributes: Attribute[]
}

export interface Highlight {
  type: 'Highlight'
  children: Inline[]
  attributes: Attribute[]
}

export interface CodeInline {
  type: 'CodeInline'
  value: string
  attributes: Attribute[]
}

export interface TextBreak {
  type: 'TextBreak'
}

export type LinkKind = 'external' | 'page' | 'tag' | 'ref' | 'cite'

export interface Link {
  type: 'Link'
  kind: LinkKind
  href: string
  target: string
  children: Inline[]
  attributes: Attribute[]
}

export interface ImageInline {
  type: 'ImageInline'
  alt: Inline[]
  src: string
  attributes: Attribute[]
}

export interface Span {
  type: 'Span'
  name: string
  children: Inline[]
  attributes: Attribute[]
}

export interface MathInline {
  type: 'MathInline'
  formula: string
  attributes: Attribute[]
}

export interface Variable {
  type: 'Variable'
  key: string
  attributes: Attribute[]
}

export type QuoteKind = 'double' | 'single'

export interface QuoteInline {
  type: 'QuoteInline'
  kind: QuoteKind
  children: Inline[]
  attributes: Attribute[]
}

export interface Spoiler {
  type: 'Spoiler'
  children: Inline[]
  attributes: Attribute[]
}
