/**
 * Cutdown parser — public API barrel.
 *
 * Primary entry-points:
 *   parse(input)            → ASTResult<NodeMap>
 *   pipeline(parse, plugins) → enriched parse function
 *
 * Type-only imports:
 *   import type { Document, Block, Inline, ... } from '@cutdown/parser'
 */

// ─── Parser ───────────────────────────────────────────────────────────────────

export { parse } from './parser/index.ts'

// ─── Transform (pipeline + ASTResult) ────────────────────────────────────────

export { ASTResult, pipeline } from './transform/index.ts'
export type { Visitors, Plugin, PluginDelta, Apply } from './transform/types.ts'

// ─── Document types ───────────────────────────────────────────────────────────

export type {
  DiagnosticLevel, Diagnostic, AttributeValue, Attribute, AttrsParseResult,
} from './types/document/common.ts'

export type {
  Inline, InlineParseResult, LinkKind,
  Text, Emphasis, Strong, Strikethrough, CodeInline, TextBreak,
  Link, ImageInline, Span, MathInline, Variable, QuoteInline,
} from './types/document/inline.ts'

export type {
  Block, Document, Page, ParseResult,
  ListItemLike, TableKind, ColumnAlign, FileGroup,
  Section, Paragraph, ThematicBreak, CodeBlock, Meta, QuoteBlock,
  List, ListItem, TaskItem, Table, Row, Cell, Column,
  FileRef, ImageBlock, FileRefGroup, NamedBlock, RefDefinition, MathBlock,
} from './types/document/blocks.ts'

export type { NodeMap } from './types/document/node-map.ts'
