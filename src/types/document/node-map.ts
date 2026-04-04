import type {
  Section, Paragraph, ThematicBreak, CodeBlock, Meta, QuoteBlock,
  List, ListItem, TaskItem, Table, Row, Cell, Column,
  FileRef, ImageBlock, FileRefGroup, NamedBlock, RefDefinition, MathBlock,
} from './blocks.ts'
import type {
  Text, Emphasis, Strong, Strikethrough, CodeInline, TextBreak,
  Link, ImageInline, Span, MathInline, Variable, Mention, QuoteInline,
} from './inline.ts'

/**
 * Flat registry of every visitable AST node type.
 *
 * Used by the D3 transformer pipeline as the base map:
 *   - Keys are the `type` discriminant of each node
 *   - Values are the corresponding interface
 *
 * Plugin deltas (`PluginDelta`) are partial maps over this type.
 * `Apply<NodeMap, [P1, P2]>` accumulates their output types.
 */
export type NodeMap = {
  // ── Block nodes ───────────────────────────────────────────────────────────
  Section: Section
  Paragraph: Paragraph
  ThematicBreak: ThematicBreak
  CodeBlock: CodeBlock
  Meta: Meta
  QuoteBlock: QuoteBlock
  List: List
  ListItem: ListItem
  TaskItem: TaskItem
  Table: Table
  Row: Row
  Cell: Cell
  Column: Column
  FileRef: FileRef
  ImageBlock: ImageBlock
  FileRefGroup: FileRefGroup
  NamedBlock: NamedBlock
  RefDefinition: RefDefinition
  MathBlock: MathBlock
  // ── Inline nodes ──────────────────────────────────────────────────────────
  Text: Text
  Emphasis: Emphasis
  Strong: Strong
  Strikethrough: Strikethrough
  CodeInline: CodeInline
  TextBreak: TextBreak
  Link: Link
  ImageInline: ImageInline
  Span: Span
  MathInline: MathInline
  Variable: Variable
  Mention: Mention
  QuoteInline: QuoteInline
}
