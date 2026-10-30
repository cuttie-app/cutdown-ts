import type {
  Section,
  Paragraph,
  CodeBlock,
  Meta,
  QuoteBlock,
  List,
  ListItem,
  TaskItem,
  Table,
  Row,
  Cell,
  Column,
  FileBlock,
  FileGroup,
  EmbedBlock,
  InjectBlock,
  NamedBlock,
  RefDefinition,
  MathBlock,
  SpoilerBlock,
} from './blocks.ts'
import type {
  Text,
  Emphasis,
  Strong,
  Highlight,
  CodeInline,
  LineBreak,
  Link,
  ImageInline,
  EmbedImageInline,
  Mark,
  MathInline,
  Variable,
  QuoteInline,
  Spoiler,
} from './inline.ts'

/**
 * Flat registry of every visitable AST node type.
 *
 * Used by the D3 transformer pipeline as the base map:
 *   - Keys are the `_type` discriminant of each node
 *   - Values are the corresponding interface
 *
 * Plugin deltas (`PluginDelta`) are partial maps over this type.
 * `Apply<NodeMap, [P1, P2]>` accumulates their output types.
 */
export type NodeMap = {
  // ── Block nodes ───────────────────────────────────────────────────────────
  Section: Section
  Paragraph: Paragraph
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
  FileBlock: FileBlock
  FileGroup: FileGroup
  EmbedBlock: EmbedBlock
  InjectBlock: InjectBlock
  NamedBlock: NamedBlock
  RefDefinition: RefDefinition
  MathBlock: MathBlock
  SpoilerBlock: SpoilerBlock
  // ── Inline nodes ──────────────────────────────────────────────────────────
  Text: Text
  Emphasis: Emphasis
  Strong: Strong
  Highlight: Highlight
  CodeInline: CodeInline
  LineBreak: LineBreak
  Link: Link
  ImageInline: ImageInline
  EmbedImageInline: EmbedImageInline
  Mark: Mark
  MathInline: MathInline
  Variable: Variable
  QuoteInline: QuoteInline
  Spoiler: Spoiler
}
