import type { Attribute, PathResourceLocator } from './common.ts'

// ─── Inline union ─────────────────────────────────────────────────────────────

export type Inline =
  | Text
  | Emphasis
  | Strong
  | Highlight
  | Spoiler
  | Link
  | CodeInline
  | MathInline
  | QuoteInline
  | ImageInline
  | EmbedImageInline
  | Mark
  | LineBreak
  | Variable

// ─── Inline nodes ─────────────────────────────────────────────────────────────

export interface Text {
  _type: 'Text'
  value: string
}

export interface Emphasis {
  _type: 'Emphasis'
  children: Inline[]
  attributes: Attribute[]
}

export interface Strong {
  _type: 'Strong'
  children: Inline[]
  attributes: Attribute[]
}

export interface Highlight {
  _type: 'Highlight'
  children: Inline[]
  attributes: Attribute[]
}

export interface Spoiler {
  _type: 'Spoiler'
  children: Inline[]
  attributes: Attribute[]
}

export type LinkKind = 'external' | 'page' | 'id' | 'ref' | 'tag' | 'cite'

/** §5.5: one link form, `[text](target)`; the target's first characters choose the kind. */
export interface Link {
  _type: 'Link'
  kind: LinkKind
  children: Inline[]
  /** kind "external"; otherwise '' */
  href: string
  /** kind "page": the target as written; otherwise '' */
  raw: string
  /** kind "page" with a valid path; otherwise null */
  path: PathResourceLocator | null
  /** kind "id" | "ref" | "tag" | "cite", without the sigil; otherwise '' */
  target: string
  attributes: Attribute[]
}

export interface CodeInline {
  _type: 'CodeInline'
  value: string
  attributes: Attribute[]
}

export interface MathInline {
  _type: 'MathInline'
  formula: string
  attributes: Attribute[]
}

export type QuoteKind = 'double' | 'single'

export interface QuoteInline {
  _type: 'QuoteInline'
  kind: QuoteKind
  children: Inline[]
  attributes: Attribute[]
}

export interface ImageInline {
  _type: 'ImageInline'
  alt: Inline[]
  raw: string
  /** null when the path is invalid (§8.5, §5.9) */
  src: PathResourceLocator | null
  attributes: Attribute[]
}

/** §5.9.1: an image whose source begins with literal `https://`. */
export interface EmbedImageInline {
  _type: 'EmbedImageInline'
  alt: Inline[]
  url: string
  attributes: Attribute[]
}

export interface Mark {
  _type: 'Mark'
  name: string
  children: Inline[]
  attributes: Attribute[]
}

export interface LineBreak {
  _type: 'LineBreak'
}

export interface Variable {
  _type: 'Variable'
  key: string
  attributes: Attribute[]
}
