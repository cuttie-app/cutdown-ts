// ─── Diagnostics ────────────────────────────────────────────────────────────

export type DiagnosticLevel = 'warning' | 'error';

export interface Diagnostic {
  code: string;
  level: DiagnosticLevel;
}

// ─── Public parse result ─────────────────────────────────────────────────────

export interface ParseResult {
  ast: Document;
  diagnostics: Diagnostic[];
}

// ─── Attributes ──────────────────────────────────────────────────────────────

export type AttributeValue = string | string[];

export interface Attribute {
  key: string;
  value: AttributeValue;
}

// ─── Document model ───────────────────────────────────────────────────────────

export interface Document {
  type: 'Document';
  children: Page[];
}

export interface Page {
  meta: Meta | null;
  children: Block[];
}

// ─── Block nodes ─────────────────────────────────────────────────────────────

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
  | MathBlock;

export interface Section {
  type: 'Section';
  level: number;
  heading: Inline[];
  attributes?: Attribute[];
  children: Block[];
}

export interface Paragraph {
  type: 'Paragraph';
  children: Inline[];
  attributes?: Attribute[];
}

export interface ThematicBreak {
  type: 'ThematicBreak';
  attributes?: Attribute[];
}

export interface CodeBlock {
  type: 'CodeBlock';
  language: string;
  content: string;
  attributes?: Attribute[];
}

export interface Meta {
  type: 'Meta';
  format: string;
  raw: string;
}

export interface QuoteBlock {
  type: 'QuoteBlock';
  children: Block[];
  attributes?: Attribute[];
}

export type ListItemLike = ListItem | TaskItem;

export interface List {
  type: 'List';
  ordered: boolean;
  start?: number;
  loose: boolean;
  children: ListItemLike[];
  attributes?: Attribute[];
}

export interface ListItem {
  type: 'ListItem';
  children: (Block | Inline)[];
  attributes?: Attribute[];
}

export interface TaskItem {
  type: 'TaskItem';
  checked: boolean;
  children: (Block | Inline)[];
  attributes?: Attribute[];
}

export type TableKind = 'simple' | 'gfm';
export type ColumnAlign = 'left' | 'right' | 'center' | 'comma' | 'decimal';

export interface Column {
  type: 'Column';
  align: ColumnAlign;
}

export interface Cell {
  type: 'Cell';
  children: Inline[];
  row: number;
  column: number;
}

export interface Row {
  type: 'Row';
  children: Cell[];
  attributes?: Attribute[];
}

export interface Table {
  type: 'Table';
  kind: TableKind;
  head?: Row[];
  body: Row[];
  columns: Column[];
  attributes?: Attribute[];
}

export type FileGroup = 'image' | 'video' | 'audio';

export interface FileRef {
  type: 'FileRef';
  src: string;
  fragment?: string;
  group?: FileGroup;
  attributes?: Attribute[];
}

export interface ImageBlock {
  type: 'ImageBlock';
  alt: Inline[];
  src: string;
  attributes?: Attribute[];
}

export interface FileRefGroup {
  type: 'FileRefGroup';
  group: FileGroup;
  children: (FileRef | ImageBlock)[];
  attributes?: Attribute[];
}

export interface NamedBlock {
  type: 'NamedBlock';
  name: string;
  attributes?: Attribute[];
  children: Block[];
}

export interface RefDefinition {
  type: 'RefDefinition';
  id: string;
  children: Inline[];
  attributes?: Attribute[];
}

export interface MathBlock {
  type: 'MathBlock';
  formula: string;
  attributes?: Attribute[];
}

// ─── Inline nodes ─────────────────────────────────────────────────────────────

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
  | QuoteInline;

export interface Text {
  type: 'Text';
  value: string;
}

export interface Emphasis {
  type: 'Emphasis';
  children: Inline[];
  attributes?: Attribute[];
}

export interface Strong {
  type: 'Strong';
  children: Inline[];
  attributes?: Attribute[];
}

export interface Strikethrough {
  type: 'Strikethrough';
  children: Inline[];
  attributes?: Attribute[];
}

export interface CodeInline {
  type: 'CodeInline';
  value: string;
  attributes?: Attribute[];
}

export interface TextBreak {
  type: 'TextBreak';
}

export type LinkKind = 'external' | 'page' | 'tag' | 'ref' | 'cite';

export interface Link {
  type: 'Link';
  kind: LinkKind;
  href?: string;
  target?: string;
  children: Inline[];
  attributes?: Attribute[];
}

export interface ImageInline {
  type: 'ImageInline';
  alt: Inline[];
  src: string;
  attributes?: Attribute[];
}

export interface Span {
  type: 'Span';
  name: string;
  attributes?: Attribute[];
  children: Inline[];
}

export interface MathInline {
  type: 'MathInline';
  formula: string;
  attributes?: Attribute[];
}

export interface Variable {
  type: 'Variable';
  key: string;
  attributes?: Attribute[];
}

export interface Mention {
  type: 'Mention';
  value: string;
  attributes?: Attribute[];
}

export interface QuoteInline {
  type: 'QuoteInline';
  kind: 'double' | 'single';
  children: Inline[];
  attributes?: Attribute[];
}
