import type { ParseResult, Document } from './types.js';
import { normalize } from './normalize.js';
import { BlockParser } from './block.js';

export type {
  ParseResult,
  Document,
  Page,
  Block,
  Section,
  Paragraph,
  ThematicBreak,
  CodeBlock,
  Meta,
  QuoteBlock,
  List,
  ListItem,
  TaskItem,
  ListItemLike,
  Table,
  Row,
  Cell,
  Column,
  ColumnAlign,
  TableKind,
  FileRef,
  FileGroup,
  ImageBlock,
  FileRefGroup,
  NamedBlock,
  RefDefinition,
  MathBlock,
  Inline,
  Text,
  Emphasis,
  Strong,
  Strikethrough,
  CodeInline,
  TextBreak,
  Link,
  LinkKind,
  ImageInline,
  Span,
  MathInline,
  Variable,
  Mention,
  QuoteInline,
  Attribute,
  AttributeValue,
  Diagnostic,
  DiagnosticLevel,
} from './types.js';

/**
 * Parse a Cutdown markup string.
 *
 * Returns `{ ast: Document, diagnostics: Diagnostic[] }`.
 * The `ast` is always a valid Document; `diagnostics` contains warnings
 * (CDN-xxxx codes) emitted during parsing.
 */
export function parse(input: string): ParseResult {
  const lines = normalize(input);
  const parser = new BlockParser(lines);
  const ast = parser.parseDocument();
  return { ast, diagnostics: parser.diagnostics };
}
