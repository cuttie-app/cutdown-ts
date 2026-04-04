## 8. Block Structure

### 8.1 Block Boundaries

Blocks are separated by one or more **blank lines**. A blank line is a line containing only whitespace characters (after normalization).

Multiple consecutive blank lines are treated as a single blank line.

A parser identifies block boundaries by scanning for blank line sequences. Each contiguous run of non-blank lines is a candidate block, then classified by its first line.

**Block elements cannot interrupt a paragraph.** A new block construct can only begin after a blank line. A line that would otherwise open a block element (a heading, a list marker, a thematic break, etc.) is paragraph content if it appears within a run of non-blank lines that began as a paragraph.

Comments (§8.3) are stripped before any other processing.

### 8.2 Leading and Trailing Whitespace

Any number of leading spaces (including none) are stripped before block classification. Indentation is never significant for block type detection in Cutdown. Indented code blocks (as in CommonMark) are not supported.

Trailing spaces on any line are ignored.

**List exception:** For list blocks, the parser records the **original column** of each marker (before stripping) for use in the list nesting stack model (§9.7.5). Block type detection still uses the stripped line; the column is a separate piece of metadata used only during list parsing.

### 8.3 Comments

A line whose first non-whitespace character is `#` is a **comment line**. Leading spaces are stripped before this check (§8.2), so an indented `  # comment` is a comment just as `# comment` is.

```
# This is a comment
  # This is also a comment
```

- Comment lines produce no AST node.
- Comment lines are **invisible** — they are not block separators.
- `#` appearing anywhere other than the first non-whitespace position of a line is literal text.
- Comment lines are stripped during block boundary analysis (before classification).

### 8.4 Block Classification

Each block candidate is classified by its first line (see §13.3 for the full classification table).

### 8.5 Syntax Primitives

Cutdown uses two structural patterns for delimiters:

#### 8.5.1 Doubled-symbol inline delimiter

Any two identical characters form an inline block delimiter:

    <Symbol><Symbol> content <Symbol><Symbol> {attrs}

The opener and closer are the same doubled symbol. Inline blocks delimited this way are composable (nestable with other types). The parser recognizes a built-in exclusive list of doubled symbols (see §10). Unrecognized doubled symbols are emitted as literal text.

#### 8.5.2 Tripled-symbol block delimiter

Any three identical characters form a block delimiter:

    <Symbol><Symbol><Symbol>[name] {attrs}
    content
    <Symbol><Symbol><Symbol>

The opener may carry an optional name and attributes. The closer is the bare tripled symbol. The parser recognizes a built-in exclusive list of tripled symbols (see §9). Unrecognized tripled symbols are emitted as literal text.

#### 8.5.3 Delimiter placement

Doubled-symbol delimiters may appear:
- Surrounded by spaces: `aa ** bb ** cc`
- Adjacent to literal text on one or both sides: `aa**bb**cc`
- Adjacent to another delimiter: `__**text**__`

In all cases the delimiter is recognized. Whether an unmatched opener is treated as literal text follows the same rule as all inline constructs (§10, §13.4).

#### 8.5.4 Symbol repetition

When N identical characters appear at an inline position, the following rules apply:

**Inline delimiter symbols** (inline parsing context):

| Symbol | 1 | 2 | 3 | 4 | 5 |
|--------|---|---|---|---|---|
| `*` | literal | `Emphasis` open/close | `**` + `*` literal | `Emphasis([])` empty | `Emphasis([])` + `*` literal |
| `_` | literal | `Strong` open/close | `__` + `_` literal | `Strong([])` empty | `Strong([])` + `_` literal |
| `"` | literal | `QuoteInline(double)` open/close | `""` + `"` literal | `QuoteInline([])` empty | `QuoteInline([])` + `"` literal |
| `'` | literal | `QuoteInline(single)` open/close | `''` + `'` literal | `QuoteInline([])` empty | `QuoteInline([])` + `'` literal |
| \` | literal | `CodeInline` open/close | \`\` + \` literal¹ | `CodeInline("")` empty | `CodeInline("\`")` |
| `~` | literal | `Strikethrough` open/close | `~~` + `~` literal¹ | `Strikethrough([])` empty | `Strikethrough([])` + `~` literal |
| `$` | literal | `MathInline` open/close | `$$` + `$` literal¹ | `MathInline("")` empty | `MathInline("$")` |

¹ When appearing at the **start of a block line**, ` ``` `, `~~~`, `$$$` are block fences (CodeBlock, Meta, MathBlock respectively). In inline context, they parse as 2-delimiter + 1 literal.

**Block/structural symbols**:

| Symbol | 1 | 2 | 3 | 4+ |
|--------|---|---|---|-----|
| `=` | Heading L1 (+space) | Heading L2 | Heading L3 | … up to L9; 10+ = literal |
| `>` | QuoteBlock L1 | QuoteBlock L2 | QuoteBlock L3 | Level N (no limit) |
| `-` | list marker (`- `+space) or literal | literal `--` | ThematicBreak (3+) | ThematicBreak (extra chars silently dropped) |
| `:` | literal | Span prefix `::name` | NamedBlock prefix `:::name` | literal |

Paired symbols (`{}`/`[]`) follow their own rules and are not covered by this table.

#### 8.5.5 Delimiter collisions

When N identical characters appear and the parser recognizes a delimiter of length 2 or 3 at that position, the maximum recognized length is consumed as the delimiter. Any remaining characters are treated as literal content.

Known collisions:

| Sequence | Parsed as |
|----------|-----------|
| `~~~` at inline position | `~~` (Strikethrough opener) + `~` (literal) |
| `$$$` at inline position | `$$` (MathInline opener) + `$` (literal) |
| \`\`\` at inline position | \`\` (CodeInline opener) + \` (literal inside) |
| `"""` at inline position | `""` (QuoteInline double opener) + `"` (literal) |
| `'''` at inline position | `''` (QuoteInline single opener) + `'` (literal) |
| `---` non-line-start | literal text (ThematicBreak only classified at line start) |

---
