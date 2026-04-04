# Cutdown Syntax — Quick Reference

Cutdown is a markup language that produces an AST. There is no HTML output. The parser never backtracks.

---

## Identifier Character Set

`ID_LITERAL = [a-zA-Z0-9._-]` — used for all identifier tokens (block names, span names, language tags, reference IDs). ASCII-only, case-sensitive everywhere.

---

## Input

- UTF-8 only. NFC normalization recommended.
- BOM stripped. Null bytes replaced with U+FFFD.
- Line endings normalized to `\n`. Tabs → single space (except inside fences).
- HTML entities (`&amp;` etc.) are **not** decoded — emitted as literal text.

---

## Comments

A line whose **first character** is `#` is a comment — produces no AST node, invisible to block detection.

```
# This is a comment
```

`#` anywhere else is literal text.

---

## Escaping

`\` before a special character emits that character literally. Before a non-special character, both `\` and the character are emitted.

Special characters: `= # * _ ~  $ [ ] ( ) ! { } : - > / \ | " '` and \`

---

## Block Elements

Blocks are separated by **blank lines**. Block elements cannot interrupt a paragraph.

### Headings → `Section`

```
= Level 1
== Level 2
=== Level 3        (up to =========  level 9)
```

Must be preceded by a blank line (or start of document). Inline content allowed. Sections are scoped to their containing block context (NamedBlock, QuoteBlock, ListItem).

### Paragraph

Any non-blank lines not matching another block. Single newline → space (soft break). `\` at line end → `TextBreak`.

### Thematic Break → `ThematicBreak` + new Page

```
---
--- {.attrs}
```

Three or more `-`. Creates a page break on top level. Exist as ThematicBreak node only if declared inside Block elements.

### Code Block → `CodeBlock`

````
```language {attrs}
literal content — no inline parsing
```
````

Language defaults to `"text"`. Fixed 3-backtick fence. No nesting. Unclosed → warning CDN-0001.

### Meta Block (Frontmatter) → `Meta`

```
~~~yaml
key: value
~~~
```

Formats: `yaml` (default), `toml`, `json`. Content is raw string. Fills `Page.meta`. No attributes. Used only on top level. Unclosed → warning CDN-0002.

### Math Block → `MathBlock`

```
$$$ {attrs}
\LaTeX formula
$$$
```

Content is literal. Unclosed → warning CDN-0003.

### Quote Block → `QuoteBlock`

```
> content
> more content
>> nested quote
```

Every line must start with `>`. No lazy continuation. Nesting by counting `>` chars.

### Lists → `List` / `ListItem` / `TaskItem`

```
- unordered item          (marker: '- ')
  - nested (2-space indent per level)

1. ordered item           (marker: '{n}. ')
2. second item

- [ ] task item
  - [x] nest task item    ({ checked: true})
```

Only `-` for unordered; only `{number}.` delimiter for ordered. Actual numbers ignored. 2-space indent per nesting level (aligns with YAML convention). Tight vs loose: blank line between items → `loose: true`. Respects indentation.

### Tables → `Table`

```
| Cell A | Cell B |          ← simple table (no header)

| Name   | Score |           ← GFM table (has header)
|:-------|------:|
| Alice  |    42 |
```

Delimiter alignment: `:---` left, `---:` right, `:---:` center, `---,` comma, `---.` decimal. Leading/trailing `|` required.

### File Reference → `FileRef`

```
/path/to/file.ext {attrs}
/path/to/image.png
```

Line starting with `/`. Known groups (image/video/audio) auto-wrapped in `FileRefGroup`. Fragment: `/page.md#section-id`.

### Image Block → `ImageBlock`

```
![alt text](src) {attrs}
```

Line starting with `![`. Block-level. Consecutive image lines wrapped in `FileRefGroup`.

### Named Block → `NamedBlock`

```
:::block-name {attrs}
  content (any blocks, including nested :::)
:::
```

`:::` + name required. Closing `:::` alone. Unclosed → warning CDN-0004. First content line establishes base indent (stripped from all lines).

### Reference Definition → `RefDefinition`

```
[^ref-id]: inline content
```

Must start at line start. Last definition wins (supports transclusion override).

---

## Inline Elements

Parsed left-to-right, no backtracking. Unclosed opener → emitted as literal text.

| Syntax | Node | Notes |
|--------|------|-------|
| `**text**` | `Emphasis` | Single `*` = literal |
| `__text__` | `Strong` | Single `_` = literal |
| `~~text~~` | `Strikethrough` | Single `~` = literal |
| ` ``code`` ` | `CodeInline` | Single `` ` `` = literal. Content literal. |
| `$$formula$$` | `MathInline` | Single `$` = literal. Content literal. |
| `""text""` | `QuoteInline(double)` | Single `"` = literal |
| `''text''` | `QuoteInline(single)` | Single `'` = literal |
| `[text](url)` | `Link(external)` | |
| `[text][page]` | `Link(page)` | target has no prefix |
| `[text][#tag]` | `Link(tag)` | resolved by consumer |
| `[text][^ref]` | `Link(ref)` | resolved by consumer |
| `[text][@cite]` | `Link(cite)` | resolved by consumer |
| `![alt](src)` | `ImageInline` | |
| `::name {attrs}` | `Span` | Empty. `::` without name = literal. |
| `{{key}}` | `Variable` | `{{}}` invalid = literal |
| `\` at line end | `TextBreak` | |

Cross-type nesting allowed (e.g. `**__text__**`). Same-type nesting not allowed (greedy close).

Run of 3 (`***`, `___`, `~~~`, ` ``` `, `$$$`, `"""`, `'''`) = 2-delimiter opener + 1 literal.

---

## Attributes

```
{#id .class key=value key="spaced value"}
```

Attach **after** their target on the same line (or next line, no blank line between).

**Block opening lines (headings, named blocks):** last `{...}` on the line → claimed by the block. Earlier `{...}` attach to preceding inline elements. Empty `{}` as last token = no attrs on block.

**Scope-chain (Rule B):** trailing `{...}` sequence at end of inline context distributed right-to-left through the node hierarchy. Last `{}` → outermost container; preceding `{}` → next inner level. Excess front `{}` silently dropped (warning CDN-0011).

```
- item {.a}{.b}   →  List({.b}, ListItem({.a}, Text("item")))
| td | {.a}{.b}   →  Table({.b}, Row({.a}, ...))     ← last row only
| td | {.a}       →  Table({.a}, Row(...))           ← mid-table: 1 slot (Row only)
```

`{{` always matched before `{` (longest opener wins).

---

## Document Model

```
Document
└── Page[]
    ├── meta: Meta | null
    └── children: (ThematicBreak | Section | Block)[]
```

- Every document has ≥ 1 Page.
- `---` → new Page (ThematicBreak is first child of new Page).
- `Meta` block → fills current `Page.meta`; if already set, opens new Page first.
- Empty Page (`meta: null`, `children: []`) = Ghost Page (valid).

---

## Precedence (inline, highest first)

1. Code fence \`\`\`, Meta fence `~~~`, Math fence `$$$` — content always literal
2. Inline code \`\` — content literal
3. Escape `\x`
4. Links `[...](...)`  and images `![...]()`
5. Inline math `$$`
6. Emphasis `**`, Strong `__`, Strikethrough `~~`, QuoteInline `""` `''`
7. `::span`
8. `{{variable}}` / `{attrs}` — longest opener (`{{` before `{`)
