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

/**
 * Normalize raw input into an array of lines ready for block parsing.
 *
 * Steps per spec §2:
 *  1. Strip UTF-8 BOM
 *  2. Replace null bytes with U+FFFD
 *  3. Normalize line endings to \n; ensure trailing \n (spec §2.5)
 *  4. Replace tabs with a single space (outside fences — handled lazily here)
 *  5. Filter comment lines (first non-whitespace char is #)
 */
export function normalize(input: string): string[] {
  // 1. Strip BOM
  let s = input.startsWith('\uFEFF') ? input.slice(1) : input;

  // 2. Replace null bytes
  s = s.replace(/\0/g, '\uFFFD');

  // 3. Normalize line endings; append trailing \n if absent
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!s.endsWith('\n')) s += '\n';

  // 4. Replace tabs (globally — fence interiors are handled by their parsers)
  s = s.replace(/\t/g, ' ');

  // Split into lines
  const raw = s.split('\n');

  // 5. Filter comment lines (first non-whitespace char is #)
  //    "Invisible to block detection" means they are removed entirely,
  //    not replaced with blank lines.
  return raw.filter(line => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith('#');
  });
}

export interface AttrsParseResult {
  attrs: Attribute[];
  diagnostics: Diagnostic[];
}

/**
 * Parse the content of a single `{...}` attribute block (including braces).
 * Handles: #id  .class  key=value  key="spaced value"  bare-key
 *
 * Ordering: attributes are emitted in the order they appear in the block.
 * Multiple .class tokens are merged into a single class entry at the position
 * of the first .class token.
 */
export function parseAttrBlock(raw: string): AttrsParseResult {
  const diagnostics: Diagnostic[] = [];

  const inner = raw.trim();
  if (!inner.startsWith('{') || !inner.endsWith('}')) {
    return { attrs: [], diagnostics };
  }
  const content = inner.slice(1, -1).trim();
  if (content === '') return { attrs: [], diagnostics };

  // Ordered list of pending attrs (placeholder index for class)
  const result: Attribute[] = [];
  let classPlaceholderIdx = -1; // position in result where class attr will go
  let classValues: string[] = [];
  let seenId = false;
  let hasClassDot = false;
  let hasClassKey = false;
  const seenCustomKeys = new Set<string>();

  let i = 0;
  while (i < content.length) {
    while (i < content.length && content[i] === ' ') i++;
    if (i >= content.length) break;

    const c = content[i];

    if (c === '#') {
      // #id
      i++;
      const start = i;
      while (i < content.length && isIdChar(content[i])) i++;
      const id = content.slice(start, i);
      if (id === '') continue;
      if (seenId) {
        diagnostics.push({ code: 'CDN-0020', level: 'warning' });
        continue;
      }
      seenId = true;
      result.push({ key: 'id', value: id });

    } else if (c === '.') {
      // .class
      i++;
      const start = i;
      while (i < content.length && isIdChar(content[i])) i++;
      const cls = content.slice(start, i);
      if (cls === '') continue;
      hasClassDot = true;
      if (classPlaceholderIdx === -1) {
        // Reserve a slot for class at current position
        classPlaceholderIdx = result.length;
        result.push({ key: 'class', value: [] }); // placeholder
      }
      classValues.push(cls);

    } else {
      // key or key=value or bare-key
      const start = i;
      while (i < content.length && content[i] !== '=' && content[i] !== ' ') i++;
      const key = content.slice(start, i);
      if (key === '') { i++; continue; }

      if (i < content.length && content[i] === '=') {
        i++; // consume =
        let value: string;
        if (i < content.length && content[i] === '"') {
          i++;
          const vs = i;
          while (i < content.length && content[i] !== '"') i++;
          value = content.slice(vs, i);
          if (i < content.length) i++;
        } else {
          const vs = i;
          while (i < content.length && content[i] !== ' ') i++;
          value = content.slice(vs, i);
        }

        if (key === 'class') {
          if (hasClassDot) {
            // .class syntax has priority — drop class= and warn
            diagnostics.push({ code: 'CDN-0021', level: 'warning' });
            continue;
          }
          if (hasClassKey) {
            // Duplicate class= key
            diagnostics.push({ code: 'CDN-0022', level: 'warning' });
            continue;
          }
          hasClassKey = true;
          // Will be overridden later if .class appears — for now insert at current position
          // If .class appears later, CDN-0021 will fire and drop the class= value
          result.push({ key: 'class', value });
          continue;
        }

        if (seenCustomKeys.has(key)) {
          diagnostics.push({ code: 'CDN-0022', level: 'warning' });
          continue;
        }
        seenCustomKeys.add(key);
        result.push({ key, value });

      } else {
        // Bare key (value = "")
        if (seenCustomKeys.has(key)) {
          diagnostics.push({ code: 'CDN-0022', level: 'warning' });
          continue;
        }
        seenCustomKeys.add(key);
        result.push({ key, value: '' });
      }
    }
  }

  // Fill in the class placeholder with merged values
  if (classPlaceholderIdx >= 0 && classValues.length > 0) {
    result[classPlaceholderIdx] = { key: 'class', value: classValues };
  }

  // Remove any empty placeholder that didn't get filled
  const finalResult = result.filter((a, idx) => {
    if (a.key === 'class' && Array.isArray(a.value) && (a.value as string[]).length === 0) return false;
    return true;
  });

  return { attrs: finalResult, diagnostics };
}

/**
 * Extract and parse all consecutive `{...}` blocks from the END of a string.
 * Returns: stripped text + groups (left-to-right order) + diagnostics.
 *
 * Used for scope-chain distribution (§5.2).
 */
export function extractTrailingAttrGroups(text: string): {
  text: string;
  groups: Attribute[][];
  diagnostics: Diagnostic[];
} {
  const allDiagnostics: Diagnostic[] = [];
  const groups: Attribute[][] = [];
  let s = text.trimEnd();

  while (s.endsWith('}')) {
    const end = s.length;
    let depth = 0;
    let start = end - 1;
    let found = false;
    for (let i = end - 1; i >= 0; i--) {
      if (s[i] === '}') depth++;
      else if (s[i] === '{') {
        depth--;
        if (depth === 0) { start = i; found = true; break; }
      }
    }
    if (!found || depth !== 0) break;

    const block = s.slice(start, end);
    const { attrs, diagnostics } = parseAttrBlock(block);
    allDiagnostics.push(...diagnostics);
    groups.unshift(attrs); // prepend: groups stay in left-to-right order
    s = s.slice(0, start).trimEnd();
  }

  return { text: s, groups, diagnostics: allDiagnostics };
}

// Special characters per spec §4
const SPECIAL_CHARS = new Set([
  '=', '#', '*', '_', '~', '`', '$', '[', ']', '(', ')', '!',
  '{', '}', ':', '-', '>', '/', '\\', '|', '"', "'",
]);

export interface InlineParseResult {
  nodes: Inline[];
  /** Trailing attribute groups for scope-chain distribution (left-to-right order) */
  trailingAttrGroups: Attribute[][];
  diagnostics: Diagnostic[];
}

/**
 * Parse inline content from a (possibly multi-line) string.
 *
 * Line joining rules:
 *  - \\ at end of line (before \n) → TextBreak node
 *  - plain \n → soft break (space)
 */
export function parseInlineText(text: string): InlineParseResult {
  const scanner = new InlineScanner(text);
  return scanner.scan();
}

/** Parse inline content from an array of lines (joined with \n internally). */
export function parseInlineLines(lines: string[]): InlineParseResult {
  if (lines.length === 0) return { nodes: [], trailingAttrGroups: [], diagnostics: [] };
  return parseInlineText(lines.join('\n'));
}

/** Merge adjacent Text nodes. */
export function mergeText(nodes: Inline[]): Inline[] {
  const result: Inline[] = [];
  for (const node of nodes) {
    const last = result[result.length - 1];
    if (node.type === 'Text' && last?.type === 'Text') {
      (last as Text).value += (node as Text).value;
    } else {
      result.push(node);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

class InlineScanner {
  private chars: string[];
  private pos: number = 0;
  private nodes: Inline[] = [];
  /** Attribute groups accumulated as trailing (right-to-left scope chain). */
  private trailingAttrGroups: Attribute[][] = [];
  private diagnostics: Diagnostic[] = [];

  constructor(text: string) {
    // Spread to array for correct Unicode codepoint iteration
    this.chars = [...text];
  }

  scan(): InlineParseResult {
    while (this.pos < this.chars.length) {
      this.step();
    }
    const merged = mergeText(this.nodes);
    // Trim trailing whitespace from the last Text before trailing attrs
    if (this.trailingAttrGroups.length > 0 && merged.length > 0) {
      const last = merged[merged.length - 1];
      if (last.type === 'Text') {
        (last as Text).value = (last as Text).value.trimEnd();
        if ((last as Text).value === '') merged.pop();
      }
    }
    return { nodes: merged, trailingAttrGroups: this.trailingAttrGroups, diagnostics: this.diagnostics };
  }

  private ch(offset = 0): string | undefined {
    return this.chars[this.pos + offset];
  }

  private peek(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
      if (this.chars[this.pos + i] !== s[i]) return false;
    }
    return true;
  }

  // Push a text node. Resets trailing attr groups because text came after them.
  private pushText(s: string): void {
    if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = [];
    this.nodes.push({ type: 'Text', value: s });
  }

  // Push an inline node (non-text). Resets trailing attr groups.
  private pushNode(node: Inline): void {
    if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = [];
    this.nodes.push(node);
  }

  private step(): void {
    const c = this.ch();
    if (c === undefined) return;

    // ── Escape ────────────────────────────────────────────────────────────────
    if (c === '\\') {
      const next = this.ch(1);
      if (next === '\n') {
        // Hard line break → TextBreak
        this.pos += 2;
        if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = [];
        this.nodes.push({ type: 'TextBreak' });
        return;
      }
      if (next !== undefined) {
        const isSpecial = SPECIAL_CHARS.has(next);
        this.pos += 2;
        this.pushText(isSpecial ? next : '\\' + next);
        return;
      }
      this.pos++;
      this.pushText('\\');
      return;
    }

    // ── Soft break (NL → zero per spec §9.2) ────────────────────────────────
    if (c === '\n') {
      this.pos++;
      // Fold to zero: no character emitted. Leading spaces on the next line
      // will be stripped by the block parser before inline parsing.
      return;
    }

    // ── Code inline `` ────────────────────────────────────────────────────────
    if (c === '`' && this.ch(1) === '`') {
      if (this.tryCodeInline()) return;
    }

    // ── Math inline $$ ────────────────────────────────────────────────────────
    if (c === '$' && this.ch(1) === '$') {
      if (this.tryLiteral2('$$', 'MathInline')) return;
    }

    // ── Emphasis ** ───────────────────────────────────────────────────────────
    if (c === '*' && this.ch(1) === '*') {
      if (this.tryDelimited('**', 'Emphasis')) return;
    }

    // ── Strong __ ─────────────────────────────────────────────────────────────
    if (c === '_' && this.ch(1) === '_') {
      if (this.tryDelimited('__', 'Strong')) return;
    }

    // ── Strikethrough ~~ ──────────────────────────────────────────────────────
    if (c === '~' && this.ch(1) === '~') {
      if (this.tryDelimited('~~', 'Strikethrough')) return;
    }

    // ── QuoteInline "" ───────────────────────────────────────────────────────
    if (c === '"' && this.ch(1) === '"') {
      if (this.tryDelimited('""', 'QuoteDouble')) return;
    }

    // ── QuoteInline '' ───────────────────────────────────────────────────────
    if (c === "'" && this.ch(1) === "'") {
      if (this.tryDelimited("''", 'QuoteSingle')) return;
    }

    // ── ImageInline ──────────────────────────────────────────────────────────
    if (c === '!' && this.ch(1) === '[') {
      if (this.tryImageInline()) return;
    }

    // ── Link ─────────────────────────────────────────────────────────────────
    if (c === '[') {
      if (this.tryLink()) return;
    }

    // ── Variable {{}} — must be checked before single { ──────────────────────
    if (c === '{' && this.ch(1) === '{') {
      if (this.tryVariable()) return;
    }

    // ── Span :: ──────────────────────────────────────────────────────────────
    if (c === ':' && this.ch(1) === ':') {
      if (this.trySpan()) return;
    }

    // ── Mention @handle ──────────────────────────────────────────────────────
    if (c === '@') {
      if (this.tryMention()) return;
    }

    // ── Inline attribute {…} ────────────────────────────────────────────────
    if (c === '{') {
      if (this.tryInlineAttrs()) return;
    }

    // ── Literal character ────────────────────────────────────────────────────
    this.pos++;
    this.pushText(c);
  }

  // ── Parsers ───────────────────────────────────────────────────────────────

  private tryCodeInline(): boolean {
    const start = this.pos;
    this.pos += 2;
    let content = '';
    let closed = false;
    while (this.pos < this.chars.length) {
      if (this.ch() === '`' && this.ch(1) === '`') {
        this.pos += 2; closed = true; break;
      }
      // Normalize newlines inside code inline → zero (spec §10.5)
      content += this.chars[this.pos] === '\n' ? '' : this.chars[this.pos];
      this.pos++;
    }
    if (!closed) {
      // Unclosed → emit opening `` as literal, rewind to char after the first `
      this.pos = start + 1;
      this.pushText('`');
      return true;
    }
    let attrs: Attribute[] | undefined;
    if (this.ch() === '{' && this.ch(1) !== '{') {
      const r = this.readAttrBlock();
      if (r && r.attrs.length > 0) attrs = r.attrs;
    }
    const node: CodeInline = { type: 'CodeInline', value: content };
    if (attrs) node.attributes = attrs;
    this.pushNode(node);
    return true;
  }

  /** Parse a double-delimiter literal-content inline: $$ ... $$ */
  private tryLiteral2(delim: string, kind: 'MathInline'): boolean {
    const start = this.pos;
    this.pos += 2;
    let content = '';
    let closed = false;
    while (this.pos < this.chars.length) {
      if (this.peek(delim)) {
        this.pos += 2; closed = true; break;
      }
      content += this.chars[this.pos++];
    }
    if (!closed) {
      this.pos = start + 1;
      this.pushText(delim[0]);
      return true;
    }
    this.pushNode({ type: 'MathInline', formula: content });
    return true;
  }

  /**
   * Parse a double-delimiter spanning inline: ** ... **, __ ... __, etc.
   * No same-type nesting (greedy close on first matching delimiter).
   * Run-of-3 (e.g. ***): opener ** + content starts with * (literal in inner parse).
   */
  private tryDelimited(delim: string, nodeType: string): boolean {
    const start = this.pos;
    this.pos += delim.length; // consume opening delimiter
    const innerStart = this.pos;

    // Scan for first closing delimiter (raw char scan — no recursive parsing here)
    let closedAt = -1;
    while (this.pos < this.chars.length) {
      if (this.peek(delim)) {
        closedAt = this.pos;
        this.pos += delim.length;
        break;
      }
      this.pos++;
    }

    if (closedAt === -1) {
      // Unclosed → emit opening delimiter as literal text
      this.pos = start + delim.length;
      // Insert text BEFORE resetting: pushText clears trailing groups
      // We want to push the literal delim as if it was just text
      if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = [];
      this.nodes.push({ type: 'Text', value: delim });
      return true;
    }

    // Parse inner content recursively; QuoteInline trims surrounding whitespace
    const rawInner = this.chars.slice(innerStart, closedAt).join('');
    const innerText = (nodeType === 'QuoteDouble' || nodeType === 'QuoteSingle') ? rawInner.trim() : rawInner;
    const innerResult = parseInlineText(innerText);
    this.diagnostics.push(...innerResult.diagnostics);
    const children = innerResult.nodes;

    // Optional trailing attrs after closing delimiter
    let attrs: Attribute[] | undefined;
    if (this.ch() === '{' && this.ch(1) !== '{') {
      const r = this.readAttrBlock();
      if (r && r.attrs.length > 0) attrs = r.attrs;
    }

    let node: Inline;
    switch (nodeType) {
      case 'Emphasis':
        node = { type: 'Emphasis', children, ...(attrs ? { attributes: attrs } : {}) } as Emphasis;
        break;
      case 'Strong':
        node = { type: 'Strong', children, ...(attrs ? { attributes: attrs } : {}) } as Strong;
        break;
      case 'Strikethrough':
        node = { type: 'Strikethrough', children, ...(attrs ? { attributes: attrs } : {}) } as Strikethrough;
        break;
      case 'QuoteDouble':
        node = { type: 'QuoteInline', kind: 'double', children, ...(attrs ? { attributes: attrs } : {}) } as QuoteInline;
        break;
      default: // QuoteSingle
        node = { type: 'QuoteInline', kind: 'single', children, ...(attrs ? { attributes: attrs } : {}) } as QuoteInline;
    }

    this.pushNode(node);
    return true;
  }

  private tryImageInline(): boolean {
    const start = this.pos;
    this.pos += 2; // consume ![

    const altChars = this.readBracketContent();
    if (altChars === null || this.ch() !== '(') {
      this.pos = start + 1;
      this.pushText('!');
      return true;
    }
    this.pos++; // consume (
    const src = this.readUntil(')');
    if (src === null) {
      this.pos = start + 1;
      this.pushText('!');
      return true;
    }
    this.pos++; // consume )

    let attrs: Attribute[] | undefined;
    if (this.ch() === '{' && this.ch(1) !== '{') {
      const r = this.readAttrBlock();
      if (r && r.attrs.length > 0) attrs = r.attrs;
    }

    const altResult = parseInlineText(altChars);
    this.diagnostics.push(...altResult.diagnostics);
    const node: ImageInline = { type: 'ImageInline', alt: altResult.nodes, src };
    if (attrs) node.attributes = attrs;
    this.pushNode(node);
    return true;
  }

  private tryLink(): boolean {
    const start = this.pos;
    this.pos++; // consume [

    const textChars = this.readBracketContent();
    if (textChars === null) {
      this.pos = start + 1;
      this.pushText('[');
      return true;
    }

    if (this.ch() === '(') {
      // [text](href)
      this.pos++;
      const href = this.readUntil(')');
      if (href === null) {
        this.pos = start + 1;
        this.pushText('[');
        return true;
      }
      this.pos++; // )

      let attrs: Attribute[] | undefined;
      if (this.ch() === '{' && this.ch(1) !== '{') {
        const r = this.readAttrBlock();
        if (r && r.attrs.length > 0) attrs = r.attrs;
      }

      const textResult = parseInlineText(textChars);
      this.diagnostics.push(...textResult.diagnostics);
      const node: Link = {
        type: 'Link', kind: 'external', href,
        children: textResult.nodes,
        ...(attrs ? { attributes: attrs } : {}),
      };
      this.pushNode(node);
      return true;
    }

    if (this.ch() === '[') {
      // [text][target]
      this.pos++;
      const target = this.readUntil(']');
      if (target === null) {
        this.pos = start + 1;
        this.pushText('[');
        return true;
      }
      this.pos++; // ]

      // Both empty → literal
      if (textChars === '' && target === '') {
        this.pos = start + 1;
        this.pushText('[');
        return true;
      }

      let kind: LinkKind = 'page';
      let resolvedTarget = target;
      if (target.startsWith('#')) { kind = 'tag'; resolvedTarget = target.slice(1); }
      else if (target.startsWith('^')) { kind = 'ref'; resolvedTarget = target.slice(1); }
      else if (target.startsWith('@')) { kind = 'cite'; resolvedTarget = target.slice(1); }

      let attrs: Attribute[] | undefined;
      if (this.ch() === '{' && this.ch(1) !== '{') {
        const r = this.readAttrBlock();
        if (r && r.attrs.length > 0) attrs = r.attrs;
      }

      const textResult = parseInlineText(textChars);
      this.diagnostics.push(...textResult.diagnostics);
      const node: Link = {
        type: 'Link', kind, target: resolvedTarget,
        children: textResult.nodes,
        ...(attrs ? { attributes: attrs } : {}),
      };
      this.pushNode(node);
      return true;
    }

    // Nothing useful after ] → literal
    this.pos = start + 1;
    this.pushText('[');
    return true;
  }

  private tryVariable(): boolean {
    const start = this.pos;
    this.pos += 2; // consume {{
    let key = '';
    let closed = false;
    while (this.pos < this.chars.length) {
      if (this.ch() === '}' && this.ch(1) === '}') {
        this.pos += 2; closed = true; break;
      }
      key += this.chars[this.pos++];
    }
    if (!closed || key.trim() === '') {
      // Emit all consumed chars as literal text (e.g. {{}} → "{{}}")
      const raw = this.chars.slice(start, this.pos).join('');
      if (this.trailingAttrGroups.length > 0) this.trailingAttrGroups = [];
      this.nodes.push({ type: 'Text', value: raw });
      return true;
    }
    this.pushNode({ type: 'Variable', key: key.trim() });
    return true;
  }

  private trySpan(): boolean {
    const start = this.pos;
    this.pos += 2; // consume ::
    const nameStart = this.pos;
    while (this.pos < this.chars.length && isIdChar(this.chars[this.pos])) this.pos++;
    const name = this.chars.slice(nameStart, this.pos).join('');
    if (name === '') {
      // :: without valid ID_LITERAL → literal '::'? No — just emit one ':' and rewind
      this.pos = start + 1;
      this.pushText(':');
      return true;
    }
    // Only skip spaces if {attrs} immediately follows; otherwise leave spaces for outer scanner
    let attrs: Attribute[] | undefined;
    {
      let tempPos = this.pos;
      while (tempPos < this.chars.length && this.chars[tempPos] === ' ') tempPos++;
      if (tempPos < this.chars.length && this.chars[tempPos] === '{' && this.chars[tempPos + 1] !== '{') {
        this.pos = tempPos;
        const r = this.readAttrBlock();
        if (r && r.attrs.length > 0) attrs = r.attrs;
      }
    }
    const node: Span = { type: 'Span', name, children: [] };
    if (attrs) node.attributes = attrs;
    this.pushNode(node);
    return true;
  }

  private tryMention(): boolean {
    const start = this.pos;
    this.pos++; // consume @
    const nameStart = this.pos;
    while (this.pos < this.chars.length && isIdChar(this.chars[this.pos])) this.pos++;
    const value = this.chars.slice(nameStart, this.pos).join('');
    if (value === '') {
      this.pos = start + 1;
      this.pushText('@');
      return true;
    }
    this.pushNode({ type: 'Mention', value });
    return true;
  }

  /**
   * Inline attribute block {…}.
   *
   * Rules:
   *  - Empty {}     → always goes to trailingAttrGroups (sentinel: no attrs for this slot).
   *  - Non-empty {} → attach to last non-Text node if one exists; else → trailingAttrGroups.
   */
  private tryInlineAttrs(): boolean {
    const r = this.readAttrBlock();
    if (!r) return false;

    const { attrs, diagnostics } = r;
    this.diagnostics.push(...diagnostics);

    if (attrs.length === 0) {
      // Empty {} → trailing sentinel (means "no attrs on this slot")
      this.trailingAttrGroups.push([]);
      return true;
    }

    // Find last non-Text node to attach to
    const lastNonText = this.findLastNonTextNode();
    if (lastNonText !== null && !('attributes' in lastNonText && (lastNonText as { attributes?: Attribute[] }).attributes)) {
      // Attach only if the node doesn't already have attributes
      (lastNonText as { attributes?: Attribute[] }).attributes = attrs;

      // Trim whitespace from the text between the element and this {attr}
      if (this.nodes.length > 0) {
        const last = this.nodes[this.nodes.length - 1];
        if (last.type === 'Text') {
          (last as Text).value = (last as Text).value.trimEnd();
          if ((last as Text).value === '') this.nodes.pop();
        }
      }
    } else if (lastNonText !== null) {
      // Node already has attrs (from a previous {…}) — this one is trailing
      this.trailingAttrGroups.push(attrs);
    } else {
      this.trailingAttrGroups.push(attrs);
    }
    return true;
  }

  private findLastNonTextNode(): Inline | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      if (this.nodes[i].type !== 'Text') return this.nodes[i];
    }
    return null;
  }

  // ── Low-level read helpers ────────────────────────────────────────────────

  /** Read content between balanced brackets `[...]`. Consumes closing `]`. Returns content string or null. */
  private readBracketContent(): string | null {
    const chars: string[] = [];
    let depth = 0;
    while (this.pos < this.chars.length) {
      const ch = this.chars[this.pos];
      if (ch === '[') { depth++; chars.push(ch); this.pos++; }
      else if (ch === ']') {
        if (depth > 0) { depth--; chars.push(ch); this.pos++; }
        else { this.pos++; return chars.join(''); }
      } else { chars.push(ch); this.pos++; }
    }
    return null; // unclosed
  }

  /** Read until a terminator char (not included). Consumes the terminator via caller. Returns content or null if not found. */
  private readUntil(terminator: string): string | null {
    let s = '';
    while (this.pos < this.chars.length) {
      if (this.chars[this.pos] === terminator) return s;
      s += this.chars[this.pos++];
    }
    return null;
  }

  /** Read a `{...}` block at current position (balanced braces). */
  private readAttrBlock(): { attrs: Attribute[]; diagnostics: Diagnostic[] } | null {
    if (this.ch() !== '{') return null;
    let depth = 0;
    let end = this.pos;
    while (end < this.chars.length) {
      if (this.chars[end] === '{') depth++;
      else if (this.chars[end] === '}') {
        depth--;
        if (depth === 0) { end++; break; }
      }
      end++;
    }
    if (depth !== 0) return null;
    const raw = this.chars.slice(this.pos, end).join('');
    this.pos = end;
    return parseAttrBlock(raw);
  }
}

// ─── ID_LITERAL helpers ───────────────────────────────────────────────────────

function isIdStart(c: string): boolean {
  return /[a-zA-Z0-9]/.test(c);
}

function isIdChar(c: string): boolean {
  return /[a-zA-Z0-9._-]/.test(c);
}

// ─── BlockParser ──────────────────────────────────────────────────────────────

export class BlockParser {
  private lines: string[];
  private pos: number = 0;
  /** True when this parser is running inside a block container (ListItem, QuoteBlock, NamedBlock).
   *  Used to enforce CDN-0030 (meta fence illegal inside containers). */
  private insideContainer: boolean;
  public diagnostics: Diagnostic[] = [];

  constructor(lines: string[], insideContainer = false) {
    this.lines = lines;
    this.insideContainer = insideContainer;
  }

  // ── Document entry ─────────────────────────────────────────────────────────

  parseDocument(): Document {
    const rawBlocks = this.parseBlocks();
    const pages = this.buildPages(rawBlocks);
    const processed = pages.map((p) => ({
      ...p,
      children: processBlocks(p.children),
    }));
    return { type: "Document", children: processed };
  }

  private buildPages(blocks: Block[]): Page[] {
    const pages: Page[] = [{ meta: null, children: [] }];
    for (const block of blocks) {
      if ((block as any).type === "Spacer") {
        pages[pages.length - 1].children.push(block);
      } else if (block.type === "Meta") {
        const cur = pages[pages.length - 1];
        if (cur.meta !== null) {
          pages.push({ meta: block as Meta, children: [] });
        } else {
          cur.meta = block as Meta;
        }
      } else if (block.type === "ThematicBreak") {
        pages.push({ meta: null, children: [block] });
      } else {
        pages[pages.length - 1].children.push(block);
      }
    }
    return pages;
  }

  // ── Block collection ───────────────────────────────────────────────────────

  parseBlocks(): Block[] {
    const blocks: Block[] = [];
    while (this.pos < this.lines.length) {
      if (this.isBlank()) {
        blocks.push({ type: "Spacer" } as any);
        this.pos++;
        continue;
      }
      blocks.push(this.parseBlock());
    }
    return blocks;
  }

  private isBlank(offset = 0): boolean {
    const l = this.lines[this.pos + offset];
    return l !== undefined && l.trim() === "";
  }

  private peek(offset = 0): string {
    return this.lines[this.pos + offset] ?? "";
  }

  private advance(): string {
    return this.lines[this.pos++] ?? "";
  }

  // ── Block dispatch (§8.2: dispatch on stripped line) ───────────────────────

  parseBlock(): Block {
    const raw = this.peek();
    const line = raw.trimStart();

    if (line.startsWith("```")) return this.parseCodeBlock();
    if (line.startsWith("~~~")) return this.parseMetaBlock();
    if (line.startsWith("$$$")) return this.parseMathBlock();
    if (line.startsWith("---")) return this.parseThematicBreak();
    if (line.startsWith("|")) return this.parseTable();
    if (line.startsWith(">")) return this.parseQuoteBlock();
    if (line.startsWith("![")) return this.parseImageBlock();
    if (line.startsWith("/")) return this.parseFileRef();
    if (line.startsWith("[^")) return this.parseRefDefinition();

    // NamedBlock :::name  or  CDN-0013 for ::: without name
    if (line.startsWith(":::")) {
      const rest = line.slice(3);
      if (rest.length > 0 && isIdStart(rest[0])) return this.parseNamedBlock();
      this.advance();
      this.diagnostics.push({ code: "CDN-0013", level: "warning" });
      return { type: "Paragraph", children: [{ type: "Text", value: line }] };
    }

    // Heading: strip raw line, count leading =
    if (line.startsWith("=")) {
      let eqCount = 0;
      while (eqCount < line.length && line[eqCount] === "=") eqCount++;
      if (eqCount < line.length && line[eqCount] === " ") {
        return this.parseHeading(eqCount);
      }
    }

    // List (marker on stripped line; record original column for stack model)
    if (isListMarkerLine(line)) {
      return this.parseList();
    }

    return this.parseParagraph();
  }

  // ── CodeBlock ──────────────────────────────────────────────────────────────

  private parseCodeBlock(): Block {
    const openLine = this.advance().trimStart();
    const rest = openLine.slice(3).trim();

    let language = "text";
    let attrs: Attribute[] | undefined;

    if (rest !== "") {
      const braceIdx = rest.indexOf("{");
      if (braceIdx >= 0) {
        language = rest.slice(0, braceIdx).trim() || "text";
        const r = parseAttrBlock(rest.slice(braceIdx));
        if (r.attrs.length > 0) attrs = r.attrs;
        this.diagnostics.push(...r.diagnostics);
      } else {
        language = rest;
      }
    }

    const contentLines: string[] = [];
    let closed = false;
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos];
      if (l.trim() === "```") {
        this.pos++;
        closed = true;
        break;
      }
      contentLines.push(l);
      this.pos++;
    }
    if (!closed) {
      this.diagnostics.push({ code: "CDN-0001", level: "warning" });
      // The normalization step (§2.5) guarantees the input ends with \n, which produces
      // a trailing "" when split. For unclosed fences that run to EOF, pop that artifact.
      if (contentLines.length > 0 && contentLines[contentLines.length - 1] === "") contentLines.pop();
    }

    const content = contentLines.join("\n");
    const node: CodeBlock = { type: "CodeBlock", language, content };
    if (attrs) node.attributes = attrs;
    return node;
  }

  // ── MetaBlock ──────────────────────────────────────────────────────────────

  private parseMetaBlock(): Block {
    const openLine = this.advance().trimStart();
    const f = openLine.slice(3).trim().toLowerCase();
    const format = ["yaml", "toml", "json"].includes(f) ? f : "yaml";

    const contentLines: string[] = [];
    const rawSpanLines: string[] = [openLine];
    let closed = false;
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos];
      rawSpanLines.push(l);
      if (l.trim() === "~~~") {
        this.pos++;
        closed = true;
        break;
      }
      contentLines.push(l);
      this.pos++;
    }
    if (!closed) {
      this.diagnostics.push({ code: "CDN-0002", level: "warning" });
    }

    // CDN-0030: meta fence inside block container → Paragraph + warning
    if (this.insideContainer) {
      this.diagnostics.push({ code: "CDN-0030", level: "warning" });
      const rawText = rawSpanLines.join("\n");
      return { type: "Paragraph", children: [{ type: "Text", value: rawText }] };
    }

    while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") contentLines.pop();
    const raw = contentLines.join("\n") + (contentLines.length > 0 ? "\n" : "");
    return { type: "Meta", format, raw };
  }

  // ── MathBlock ─────────────────────────────────────────────────────────────

  private parseMathBlock(): Block {
    const openLine = this.advance().trimStart();
    const rest = openLine.slice(3).trim();
    let attrs: Attribute[] | undefined;
    if (rest.startsWith("{")) {
      const r = parseAttrBlock(rest);
      if (r.attrs.length > 0) attrs = r.attrs;
      this.diagnostics.push(...r.diagnostics);
    }

    const contentLines: string[] = [];
    let closed = false;
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos];
      if (l.trim() === "$$$") {
        this.pos++;
        closed = true;
        break;
      }
      contentLines.push(l);
      this.pos++;
    }
    if (!closed) {
      this.diagnostics.push({ code: "CDN-0003", level: "warning" });
      if (contentLines.length > 0 && contentLines[contentLines.length - 1] === "") contentLines.pop();
    }

    const formula = contentLines.join("\n");
    const node: MathBlock = { type: "MathBlock", formula };
    if (attrs) node.attributes = attrs;
    return node;
  }

  // ── ThematicBreak ─────────────────────────────────────────────────────────

  private parseThematicBreak(): Block {
    const line = this.advance().trimStart();
    const rest = line.replace(/^-+/, "").trim();

    let attrs: Attribute[] | undefined;
    if (rest !== "") {
      if (rest.startsWith("{")) {
        const r = parseAttrBlock(rest);
        if (r.attrs.length > 0) attrs = r.attrs;
        this.diagnostics.push(...r.diagnostics);
      } else {
        this.diagnostics.push({ code: "CDN-0010", level: "warning" });
        const brace = rest.indexOf("{");
        if (brace >= 0) {
          const r = parseAttrBlock(rest.slice(brace));
          if (r.attrs.length > 0) attrs = r.attrs;
          this.diagnostics.push(...r.diagnostics);
        }
      }
    }

    const node: ThematicBreak = { type: "ThematicBreak" };
    if (attrs) node.attributes = attrs;
    return node;
  }

  // ── Heading / Section ─────────────────────────────────────────────────────

  private parseHeading(eqCount: number): Block {
    const rawLine = this.advance();
    const line = rawLine.trimStart();
    // firstContent: everything after the = signs and required space
    const lines: string[] = [line.slice(eqCount + 1)];

    // Collect multi-line attribute chain (Single-NL transparency)
    while (this.pos < this.lines.length && this.peek().trim().startsWith("{")) {
      lines.push(this.advance());
    }

    if (eqCount > 9) {
      this.diagnostics.push({ code: "CDN-0012", level: "warning" });
      return { type: "Paragraph", children: [{ type: "Text", value: line }] };
    }

    const level = eqCount;
    const fullContent = lines.join("\n");

    const { nodes: heading, trailingAttrGroups, diagnostics } = parseInlineText(fullContent);
    this.diagnostics.push(...diagnostics);

    const node: Section = { type: "Section", level, heading, children: [] };
    distributeScopeChain(trailingAttrGroups, [node, heading], this.diagnostics);
    return node;
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  private parseTable(): Block {
    const tableLines: string[] = [];
    while (this.pos < this.lines.length && this.lines[this.pos].trimStart().startsWith("|")) {
      tableLines.push(this.lines[this.pos++]);
    }

    // Collect trailing attribute lines for the last row/table (Single-NL transparency)
    const attrLines: string[] = [];
    while (this.pos < this.lines.length && this.peek().trim().startsWith("{")) {
      attrLines.push(this.advance());
    }

    const delimIdx = tableLines.findIndex((l) => isDelimiterRow(l));
    const isGfm = delimIdx === 1;

    const columns: Column[] = [];
    if (isGfm) {
      for (const cell of splitCells(tableLines[delimIdx])) {
        columns.push({ type: "Column", align: parseColumnAlign(cell.trim()) });
      }
    }

    const dataRows = tableLines.filter((_, i) => i !== delimIdx);
    const rowsData: Array<{ cells: string[]; attrGroups: Attribute[][] }> = dataRows.map((l) => parseTableRowLine(l));

    const colCount = Math.max(...rowsData.map((r) => r.cells.length), 0);
    if (!isGfm) {
      for (let i = 0; i < colCount; i++) columns.push({ type: "Column", align: "left" });
    }

    const rows: Row[] = rowsData.map((rd, rowIdx) => ({
      type: "Row" as const,
      children: rd.cells.map((cellText, colIdx) => {
        const { nodes } = parseInlineText(cellText.trim());
        return { type: "Cell" as const, children: nodes, row: rowIdx, column: colIdx };
      }),
    }));

    let head: Row[] | undefined;
    let body: Row[] = rows;
    if (isGfm && rows.length > 0) {
      head = [rows[0]];
      body = rows.slice(1);
      body.forEach((r, i) =>
        r.children.forEach((c) => {
          c.row = i;
        }),
      );
    }

    const table: Table = { type: "Table", kind: isGfm ? "gfm" : "simple", body, columns };
    if (head) table.head = head;

    // Distribute scope chain: last -> Table, preceding -> last Row
    const lastRowData = rowsData[rowsData.length - 1];
    let groups: Attribute[][] = lastRowData?.attrGroups ?? [];
    if (attrLines.length > 0) {
      const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join("\n"));
      this.diagnostics.push(...diagnostics);
      groups = [...groups, ...trailingAttrGroups];
    }
    const slots: any[] = [table];
    if (rows.length > 0) slots.push(rows[rows.length - 1]);
    distributeScopeChain(groups, slots, this.diagnostics);

    return table;
  }

  // ── QuoteBlock ────────────────────────────────────────────────────────────

  private parseQuoteBlock(): Block {
    const contentLines: string[] = [];
    let attrs: Attribute[] | undefined;
    let firstLine = true;

    while (this.pos < this.lines.length && this.lines[this.pos].trimStart().startsWith(">")) {
      const raw = this.lines[this.pos++];
      const line = raw.trimStart();
      // Strip exactly one '>' level (and optional single space after it)
      const rest = line.slice(1);
      const stripped = rest.startsWith(" ") ? rest.slice(1) : rest;

      if (firstLine) {
        // Trailing {attr} on first line attaches to the QuoteBlock
        const { text, groups, diagnostics: attrDiags } = extractTrailingAttrGroups(stripped);
        this.diagnostics.push(...attrDiags);
        if (groups.length > 0) {
          distributeScopeChain(groups, [{ attributes: undefined }], this.diagnostics);
          attrs = groups[groups.length - 1].length > 0 ? groups[groups.length - 1] : undefined;
        }
        contentLines.push(text);
        firstLine = false;
      } else {
        contentLines.push(stripped);
      }
    }

    const sub = new BlockParser(contentLines, true);
    const children = sub.parseBlocks();
    this.diagnostics.push(...sub.diagnostics);
    const node: QuoteBlock = { type: "QuoteBlock", children };
    if (attrs) node.attributes = attrs;
    return node;
  }

  // ── List ──────────────────────────────────────────────────────────────────

  private parseList(): Block {
    const raw = this.peek();
    const stripped = raw.trimStart();
    const col = raw.length - stripped.length;
    return this.parseListAtCol(col);
  }

  private parseListAtCol(col: number): List {
    const firstStripped = this.peek().trimStart();
    const ordered = /^\d+\. /.test(firstStripped);
    const list: List = { type: "List", ordered, loose: false, children: [] };
    let firstStart: number | undefined;

    while (this.pos < this.lines.length) {
      const raw = this.peek();
      const stripped = raw.trimStart();
      const lineCol = raw.length - stripped.length;

      // Blank line: check what follows
      if (stripped === "") {
        let offset = 1;
        while (this.isBlank(offset)) offset++;
        const nextRaw = this.peek(offset);
        const nextStripped = nextRaw.trimStart();
        const nextCol = nextRaw.length - nextStripped.length;

        if (isListMarkerLine(nextStripped) && nextCol === col) {
          // Same-col marker after blank
          if (col === 0) break; // col-0 rule: blank + col-0 marker ends list (§9.7.5)
          // col > 0: absorbed as loose
          list.loose = true;
          this.pos += offset;
          continue;
        }
        break;
      }

      // Non-blank: must be a marker at exactly our column to stay in this list
      if (!isListMarkerLine(stripped) || lineCol !== col) break;

      const result = this.parseListItemAtCol(col);
      list.children.push(result.item);
      if (result.absorbedBlank) list.loose = true;
      if (firstStart === undefined && result.start !== undefined) {
        firstStart = result.start;
        list.start = firstStart;
      }
      if (result.attrGroups && result.attrGroups.length > 0) {
        distributeScopeChain(result.attrGroups, [list, result.item, (result.item as any).children], this.diagnostics);
      }
    }

    return list;
  }

  private parseListItemAtCol(col: number): {
    item: ListItemLike;
    start?: number;
    attrGroups?: Attribute[][];
    absorbedBlank: boolean;
  } {
    const firstRaw = this.advance();
    const firstStripped = firstRaw.trimStart();

    let markerLen: number;
    let checked: boolean | undefined;
    let start: number | undefined;

    const numericMatch = firstStripped.match(/^(\d+)\. /);
    if (firstStripped.startsWith("- [ ] ")) {
      markerLen = 6;
      checked = false;
    } else if (firstStripped.startsWith("- [x] ") || firstStripped.startsWith("- [X] ")) {
      markerLen = 6;
      checked = true;
    } else if (numericMatch) {
      markerLen = numericMatch[0].length;
      start = parseInt(numericMatch[1], 10);
    } else {
      markerLen = 2;
    }

    // Content indent: how many chars to strip from continuation lines
    const contentIndent = col + markerLen;
    const firstContent = firstStripped.slice(markerLen);
    const contentLines: string[] = [firstContent];
    let absorbedBlank = false;

    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      const lineStripped = line.trimStart();
      const lineCol = line.length - lineStripped.length;

      if (lineStripped === "") {
        // Blank line: check what follows
        let offset = 1;
        while (this.isBlank(offset)) offset++;
        const nextRaw = this.peek(offset);
        const nextStripped = nextRaw.trimStart();
        const nextCol = nextRaw.length - nextStripped.length;

        if (nextCol > col) {
          // Indented content → absorbed into this item (block mode)
          for (let i = 0; i < offset; i++) contentLines.push("");
          this.pos += offset;
          absorbedBlank = true;
          continue;
        }
        break;
      }

      if (lineCol <= col) break; // back to same or shallower level

      // This line belongs to this item; strip contentIndent chars
      const stripped_content = line.length >= contentIndent ? line.slice(contentIndent) : lineStripped;
      contentLines.push(stripped_content);
      this.pos++;
    }

    // Collect trailing attribute lines (Single-NL transparency)
    const attrLines: string[] = [];
    while (this.pos < this.lines.length && this.peek().trim().startsWith("{")) {
      attrLines.push(this.advance());
    }

    const hasBlank = contentLines.some((l) => l.trim() === "");
    let children: (Block | Inline)[];
    let groups: Attribute[][] = [];

    if (hasBlank) {
      const sub = new BlockParser(contentLines, true);
      children = sub.parseBlocks();
      this.diagnostics.push(...sub.diagnostics);
      if (attrLines.length > 0) {
        const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join("\n"));
        this.diagnostics.push(...diagnostics);
        groups = trailingAttrGroups;
      }
    } else {
      const { result, trailing } = this.parseItemInlineContent(contentLines);
      children = result;
      this.diagnostics.push(...trailing.diagnostics);
      groups = trailing.trailingAttrGroups;
      if (attrLines.length > 0) {
        const pr = parseInlineText(attrLines.join("\n"));
        this.diagnostics.push(...pr.diagnostics);
        groups = [...groups, ...pr.trailingAttrGroups];
      }
    }

    let item: ListItemLike;
    if (checked !== undefined) {
      item = { type: "TaskItem", checked, children };
    } else {
      item = { type: "ListItem", children };
    }

    return { item, start, attrGroups: groups, absorbedBlank };
  }

  /**
   * Parse a tight list item's content lines.
   * Lines are already stripped of the item's indent (contentIndent chars).
   * Detects nested list markers by stripping further and checking.
   */
  private parseItemInlineContent(contentLines: string[]): {
    result: (Block | Inline)[];
    trailing: { trailingAttrGroups: Attribute[][]; diagnostics: Diagnostic[] };
  } {
    const result: (Block | Inline)[] = [];
    let trailingAttrGroups: Attribute[][] = [];
    const allDiagnostics: Diagnostic[] = [];

    let i = 0;
    let pendingTextLines: string[] = [];

    const flushText = () => {
      if (pendingTextLines.length === 0) return;
      const pr = parseInlineLines(pendingTextLines);
      result.push(...pr.nodes);
      trailingAttrGroups = pr.trailingAttrGroups;
      allDiagnostics.push(...pr.diagnostics);
      pendingTextLines = [];
    };

    while (i < contentLines.length) {
      const line = contentLines[i];
      const stripped = line.trimStart();
      const lineCol = line.length - stripped.length;

      if (isListMarkerLine(stripped)) {
        flushText();
        // Collect the sub-list lines, normalising to col-0 within the sub-list
        const subLines: string[] = [stripped];
        let j = i + 1;
        while (j < contentLines.length) {
          const next = contentLines[j];
          const nextStripped = next.trimStart();
          const nextCol = next.length - nextStripped.length;
          if (nextCol > lineCol || isListMarkerLine(nextStripped)) {
            subLines.push(nextCol > lineCol ? next.slice(lineCol) : nextStripped);
            j++;
          } else break;
        }
        i = j - 1;

        const subParser = new BlockParser(subLines);
        const nestedBlocks = subParser.parseBlocks();
        this.diagnostics.push(...subParser.diagnostics);
        result.push(...nestedBlocks);
        trailingAttrGroups = [];
      } else {
        pendingTextLines.push(line);
      }
      i++;
    }
    flushText();

    return { result, trailing: { trailingAttrGroups, diagnostics: allDiagnostics } };
  }

  // ── ImageBlock ────────────────────────────────────────────────────────────

  private parseImageBlock(): Block {
    const line = this.advance().trimStart();
    const m = line.match(/^!\[([^\]]*)\]\(([^)]*)\)(.*)?$/);
    if (!m) {
      const { nodes } = parseInlineText(line);
      return { type: "Paragraph", children: nodes };
    }
    const altText = m[1],
      src = m[2],
      rest = (m[3] ?? "").trim();
    const attrLines: string[] = [rest];

    while (this.pos < this.lines.length && this.peek().trim().startsWith("{")) {
      attrLines.push(this.advance());
    }

    const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join("\n"));
    this.diagnostics.push(...diagnostics);

    const { nodes: alt } = parseInlineText(altText);
    const node: ImageBlock = { type: "ImageBlock", alt, src };

    if (trailingAttrGroups.length > 0) (node as any).attrGroups = trailingAttrGroups;
    distributeScopeChain(trailingAttrGroups, [node, alt], this.diagnostics);

    return node;
  }

  // ── FileRef ───────────────────────────────────────────────────────────────

  private parseFileRef(): Block {
    const line = this.advance().trimStart();
    const pathPart = line.slice(1); // strip leading /

    const { text, groups, diagnostics: attrDiags } = extractTrailingAttrGroups(pathPart);
    this.diagnostics.push(...attrDiags);

    let src = text.trim();
    const attrLines: string[] = [];
    while (this.pos < this.lines.length && this.peek().trim().startsWith("{")) {
      attrLines.push(this.advance());
    }

    let finalGroups = groups;
    if (attrLines.length > 0) {
      const { trailingAttrGroups, diagnostics } = parseInlineText(attrLines.join("\n"));
      this.diagnostics.push(...diagnostics);
      finalGroups = [...groups, ...trailingAttrGroups];
    }

    let fragment: string | undefined;
    const hashIdx = src.indexOf("#");
    if (hashIdx >= 0) {
      fragment = src.slice(hashIdx + 1);
      src = src.slice(0, hashIdx);
    }
    src = "/" + src;

    const group = detectFileGroup(src);
    const node: FileRef = { type: "FileRef", src };
    if (fragment) node.fragment = fragment;
    if (group) node.group = group;

    if (finalGroups.length > 0) (node as any).attrGroups = finalGroups;
    distributeScopeChain(finalGroups, [node], this.diagnostics);

    return node;
  }

  // ── RefDefinition ─────────────────────────────────────────────────────────

  private parseRefDefinition(): Block {
    const line = this.advance().trimStart();
    const m = line.match(/^\[\^([^\]]+)\]:\s*(.*)/);
    if (!m) {
      const { nodes } = parseInlineText(line);
      return { type: "Paragraph", children: nodes };
    }
    const id = m[1],
      content = m[2];
    const { nodes: children } = parseInlineText(content);
    return { type: "RefDefinition", id, children };
  }

  // ── NamedBlock ────────────────────────────────────────────────────────────

  private parseNamedBlock(): Block {
    const openLine = this.advance().trimStart();
    const rest = openLine.slice(3);

    let name = "";
    let i = 0;
    while (i < rest.length && isIdChar(rest[i])) name += rest[i++];

    const afterName = rest.slice(i).trim();
    const openerAttrLines: string[] = [afterName];

    while (this.pos < this.lines.length && this.peek().trim().startsWith("{")) {
      openerAttrLines.push(this.advance());
    }

    const { trailingAttrGroups, diagnostics: attrDiags } = parseInlineText(openerAttrLines.join("\n"));
    this.diagnostics.push(...attrDiags);

    const node: NamedBlock = { type: "NamedBlock", name, children: [] };
    distributeScopeChain(trailingAttrGroups, [node], this.diagnostics);

    const contentLines: string[] = [];
    let closed = false;
    let depth = 1;
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos];
      const trimmed = l.trim();
      if (trimmed.startsWith(":::")) {
        const afterColons = trimmed.slice(3);
        if (afterColons.length > 0 && isIdStart(afterColons[0])) {
          depth++;
          contentLines.push(l);
          this.pos++;
        } else if (afterColons === "") {
          depth--;
          if (depth === 0) {
            this.pos++;
            closed = true;
            break;
          }
          contentLines.push(l);
          this.pos++;
        } else {
          contentLines.push(l);
          this.pos++;
        }
      } else {
        contentLines.push(l);
        this.pos++;
      }
    }
    if (!closed) this.diagnostics.push({ code: "CDN-0004", level: "warning" });

    // Strip base indent (from first non-blank line)
    const baseIndent = contentLines.find((l) => l.trim() !== "")?.match(/^( *)/)?.[1].length ?? 0;
    const stripped = contentLines.map((l) => (l.length >= baseIndent ? l.slice(baseIndent) : l.trimStart()));

    const sub = new BlockParser(stripped, true);
    node.children = sub.parseBlocks();
    this.diagnostics.push(...sub.diagnostics);

    return node;
  }

  // ── Paragraph ─────────────────────────────────────────────────────────────

  private parseParagraph(): Block {
    const paraLines: string[] = [];
    while (this.pos < this.lines.length && this.lines[this.pos].trim() !== "") {
      if (paraLines.length > 0 && this.peek().trim().startsWith("{")) break;
      paraLines.push(this.lines[this.pos++]);
    }

    const attrLines: string[] = [];
    while (this.pos < this.lines.length && this.peek().trim().startsWith("{")) {
      attrLines.push(this.advance());
    }

    // Strip leading spaces from continuation lines (§9.2)
    const joined = paraLines.map((l, idx) => (idx === 0 ? l : l.trimStart())).join("\n");

    const { nodes, trailingAttrGroups, diagnostics } = parseInlineText(joined);
    this.diagnostics.push(...diagnostics);

    let groups = trailingAttrGroups;
    if (attrLines.length > 0) {
      const pr = parseInlineText(attrLines.join("\n"));
      this.diagnostics.push(...pr.diagnostics);
      groups = [...groups, ...pr.trailingAttrGroups];
    }

    const node: Paragraph = { type: "Paragraph", children: nodes };
    distributeScopeChain(groups, [node, nodes], this.diagnostics);
    return node;
  }
}

// ─── Post-processing passes ───────────────────────────────────────────────────

/**
 * Distribute an attribute chain to available scope slots (right-to-left).
 * slots[0] is Slot 1 (last {}), slots[1] is Slot 2, etc.
 * If a slot is an array (Inline[]), find the last non-Text node.
 */
function distributeScopeChain(groups: Attribute[][], slots: any[], diagnostics?: Diagnostic[]): void {
  for (let i = 0; i < groups.length; i++) {
    const groupIdx = groups.length - 1 - i;
    const group = groups[groupIdx];
    let claimed = false;

    if (i < slots.length) {
      const slot = slots[i];
      if (slot) {
        if (Array.isArray(slot)) {
          for (let j = slot.length - 1; j >= 0; j--) {
            const n = slot[j];
            if (typeof n === "object" && n.type !== "Text") {
              if (group.length > 0) (n as any).attributes = group;
              else delete (n as any).attributes;
              claimed = true;
              break;
            }
          }
        } else if (typeof slot === "object") {
          if (group.length > 0) slot.attributes = group;
          else delete slot.attributes;
          claimed = true;
        }
      }
    }

    if (!claimed) {
      diagnostics?.push({ code: "CDN-0011", level: "warning" });
    }
  }
}

function processBlocks(blocks: Block[]): Block[] {
  // Apply passes: S12 → S10 → S8; filter Spacers from result
  let result = nestSections(blocks);
  result = deduplicateRefDefs(result);
  result = groupFileRefs(result);
  // Remove Spacers from the final block list
  result = result.filter((b) => (b as any).type !== "Spacer");

  // Recursively process children of container blocks
  for (const block of result) {
    if (block.type === "Section" || block.type === "QuoteBlock" || block.type === "NamedBlock") {
      (block as any).children = processBlocks((block as any).children);
    } else if (block.type === "List") {
      for (const item of (block as List).children) {
        item.children = processListItemChildren(item.children);
      }
    }
  }

  return result;
}

function processListItemChildren(children: (Block | Inline)[]): (Block | Inline)[] {
  const blocks = children.filter((c) => typeof c === "object" && "type" in c && isBlockType(c.type)) as Block[];
  const inlines = children.filter((c) => !blocks.includes(c as any));

  if (blocks.length > 0) {
    const processedBlocks = processBlocks(blocks);
    return [...inlines, ...processedBlocks];
  }
  return children;
}

function isBlockType(type: string): boolean {
  return [
    "Section",
    "Paragraph",
    "ThematicBreak",
    "CodeBlock",
    "Meta",
    "QuoteBlock",
    "List",
    "Table",
    "FileRef",
    "ImageBlock",
    "FileRefGroup",
    "NamedBlock",
    "RefDefinition",
    "MathBlock",
    "Spacer",
  ].includes(type);
}

function nestSections(blocks: Block[]): Block[] {
  const result: Block[] = [];
  const stack: Array<{ level: number; section: Section }> = [];

  for (const block of blocks) {
    if (block.type === "Section") {
      const sec = block as Section;
      while (stack.length > 0 && stack[stack.length - 1].level >= sec.level) stack.pop();
      if (stack.length > 0) {
        stack[stack.length - 1].section.children.push(sec);
      } else {
        result.push(sec);
      }
      stack.push({ level: sec.level, section: sec });
    } else {
      if (stack.length > 0) stack[stack.length - 1].section.children.push(block);
      else result.push(block);
    }
  }
  return result;
}

function deduplicateRefDefs(blocks: Block[]): Block[] {
  const last = new Map<string, number>();
  blocks.forEach((b, i) => {
    if (b.type === "RefDefinition") last.set((b as RefDefinition).id, i);
  });
  return blocks.filter((b, i) => b.type !== "RefDefinition" || last.get((b as RefDefinition).id) === i);
}

function groupFileRefs(blocks: Block[]): Block[] {
  const result: Block[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if ((b as any).type === "Spacer") {
      i++;
      continue;
    }
    const group = blockFileGroup(b);
    if (group !== undefined) {
      const children: (FileRef | ImageBlock)[] = [b as FileRef | ImageBlock];
      while (i + 1 < blocks.length) {
        const next = blocks[i + 1];
        if ((next as any).type === "Spacer") break;
        if (blockFileGroup(next) === group) {
          i++;
          children.push(blocks[i] as FileRef | ImageBlock);
        } else break;
      }

      if (children.length > 1 || children[0].type === "FileRef") {
        const groupNode: FileRefGroup = { type: "FileRefGroup", group, children };
        result.push(groupNode);
        const lastItem = children[children.length - 1];
        const groups = (lastItem as any).attrGroups;
        if (groups && groups.length > 0) {
          const slots: any[] = [groupNode, lastItem];
          if (lastItem.type === "ImageBlock") slots.push(lastItem.alt);
          distributeScopeChain(groups, slots);
        }
      } else {
        result.push(children[0]);
      }
    } else {
      result.push(b);
    }
    i++;
  }
  return result;
}

function blockFileGroup(block: Block): FileGroup | undefined {
  if (block.type === "FileRef") return (block as FileRef).group;
  if (block.type === "ImageBlock") return "image";
  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isListMarkerLine(line: string): boolean {
  return /^\d+\. /.test(line) || line.startsWith("- ") || line.startsWith("- [");
}

function isDelimiterRow(line: string): boolean {
  return line.trimStart().startsWith("|") && /\|[\s:]*-{2,}[\s:]*\|/.test(line);
}

function splitCells(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const parts = inner.split("|");
  if (parts[parts.length - 1].trim() === "") parts.pop();
  return parts;
}

function parseTableRowLine(line: string): { cells: string[]; attrGroups: Attribute[][] } {
  const trimmed = line.trim();
  const { text: cellsPart, groups } = extractTrailingAttrGroups(trimmed);
  const cells = splitCells(cellsPart.trimEnd());
  return { cells, attrGroups: groups };
}

function parseColumnAlign(s: string): ColumnAlign {
  if (s.endsWith(",")) return "comma";
  if (s.endsWith(".")) return "decimal";
  if (s.startsWith(":") && s.endsWith(":")) return "center";
  if (s.startsWith(":")) return "left";
  if (s.endsWith(":")) return "right";
  return "left";
}

function detectFileGroup(src: string): FileGroup | undefined {
  const ext = src.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "flac"].includes(ext)) return "audio";
  return undefined;
}

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
