import type {
  Inline, Text, Emphasis, Strong, Strikethrough, CodeInline,
  TextBreak, Link, LinkKind, ImageInline, Span, MathInline,
  Variable, Mention, QuoteInline, Attribute, Diagnostic,
} from './types.js';
import { parseAttrBlock } from './attrs.js';

// Special characters per spec §4
const SPECIAL_CHARS = new Set([
  '=', '#', '*', '_', '~', '`', '$', '[', ']', '(', ')', '!',
  '{', '}', ':', '-', '>', '/', '\\', '|', '"', "'",
]);

// ID_LITERAL per spec §1: [a-zA-Z0-9._-]
function isIdChar(c: string): boolean {
  return /[a-zA-Z0-9._-]/.test(c);
}

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
