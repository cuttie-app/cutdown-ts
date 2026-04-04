## 9. Block Elements

### 9.1 Headings

**Syntax:** `={n} TEXT`

- `n` equal signs (`=`), where `n` is in range `[1..9]`
- Followed by exactly one space
- Followed by inline content

```
Regex: ^(={1,9}) (.+)$
```

| Syntax | Level |
|--------|-------|
| `= Heading` | 1 |
| `== Heading` | 2 |
| `=== Heading` | 3 |
| `==== Heading` | 4 |
| `===== Heading` | 5 |
| `====== Heading` | 6 |
| `======= Heading` | 7 |
| `======== Heading` | 8 |
| `========= Heading` | 9 |

A heading MUST be preceded by a blank line (or be the first non-comment line of the document, or the first non-comment line of the current block container — see §7.2).

Heading text is **parsed by inline rules (§10)** — all inline formatting (emphasis, links, inline code, math, etc.) is valid inside a heading. The result is `Inline[]`.

#### Heading Attributes — Last-Attr Rule

The **last** `{...}` token on the heading line is claimed by the heading itself. All earlier `{...}` tokens follow normal inline attachment rules (§5.2) and attach to their preceding inline element.

An explicit empty `{}` as the last token means the heading carries no attributes, while allowing earlier `{...}` to attach to inline elements.

```
= H1 [with link](..){.class}
```
→ `{.class}` is the last token → claimed by heading.
→ AST: `Section(level=1, {class:"class"}, [Text("H1 "), Link(children=[Text("with link")], href="..")])`

```
= H1 [with link](..){.class}{}
```
→ `{}` is the last token → heading has no attributes.
→ `{.class}` attaches to preceding inline element (the link).
→ AST: `Section(level=1, {}, [Text("H1 "), Link(children=[Text("with link")], href="..", {class:"class"})])`

This rule applies only to lines that open a block construct (headings, named blocks). In paragraph context all `{...}` follow inline attachment rules exclusively.

AST: `Heading { level: 2, content: Inline[], attributes: Attributes }`

The heading node is consumed into its enclosing `Section` node. Consumers receive `Section`, not bare `Heading` nodes.

---

### 9.2 Paragraphs

A paragraph is a contiguous sequence of non-blank lines that do not match any other block construct. Once a paragraph has begun, no block element can interrupt it — the paragraph continues until a blank line is encountered (see §8.1).

Inline content of all lines is **parsed by inline rules (§10)** and concatenated. The result is `Inline[]`. A single newline between lines is a **soft break** — it is folded to zero: no character is emitted and no AST node is produced. Lines concatenate directly. Leading spaces on continuation lines are stripped before inline parsing.

To introduce a word boundary across a line break, place a single trailing space before the newline. That space is preserved as `Text(" ")`.

A text break is produced by placing `\` at the end of a line (see §10.6).

```
Input (default — no separator):
  First line
  second line\
  third line

AST:
  Paragraph
  ├── Text("First linesecond line")
  ├── TextBreak
  └── Text("third line")

Input (trailing space — explicit word boundary):
  First line 
  second line

AST:
  Paragraph
  └── Text("First line second line")
```

---

### 9.3 Thematic Break

**Syntax:** `---` or more dashes (3 or more consecutive `-` at line start). Any characters between the dashes and the optional `{attrs}` are silently dropped.

- `---` always produces a `ThematicBreak` node — there is no position restriction.
- At **Page scope**: `ThematicBreak` creates a page break — a new Page is opened and the `ThematicBreak` node becomes the first child of that new Page.
- Inside a **block container** (`ListItem`, `TaskItem`, `QuoteBlock`, `NamedBlock`): `ThematicBreak` emits a `ThematicBreak` node but does **not** create a new Page. Page Assembly (§13.6) only applies at Page scope.
- May carry attributes for consumer use (e.g., styled dividers).

```
AST: ThematicBreak { attributes: Attributes }
```

**Examples:**

```
---                  → ThematicBreak { attributes: {} }
--- {.page-end}      → ThematicBreak { attributes: { class: ["page-end"] } }
--- some text {.x}   → ThematicBreak { attributes: { class: ["x"] } }  (text dropped)
```

---

### 9.4 Code Block

**Syntax:** Fenced with exactly three backticks.

````
```language {attrs}
content
```
````

- Opening fence: ` ``` ` optionally followed by a language identifier and/or attributes.
- Language identifier: `[ID_LITERAL]+` (see §1), optional. Defaults to `"text"` when absent.
- Attributes: optional, follow standard attribute syntax (§5).
- Content: literal — no inline parsing is performed inside a code block. Content lines are joined with `\n`; no trailing `\n` is appended. Blank lines within the fence are preserved verbatim.
- Closing fence: ` ``` ` on its own line.
- Fence character: backtick only. `~~~` is reserved for metadata (§9.5).
- Minimum fence length: exactly 3 backticks. Variable-length fences are not supported.
- Nesting: not supported. The first ` ``` ` closing line ends the block.
- Unclosed fence: content runs to end of document.
- **Inside block containers:** legal inside `ListItem`, `TaskItem`, `QuoteBlock`, and `NamedBlock`. The closing fence is recognised after leading-space stripping regardless of indentation. Content indentation handling varies by container:
  - `ListItem` / `TaskItem` / `NamedBlock`: the container's base indentation offset is stripped from each content line before storing in `content`.
  - `QuoteBlock`: only the `>` prefix is stripped (per §9.6); no additional space stripping applies to code block content.

> **Out of scope:** Embedding a literal Cutdown code block inside a `CodeBlock` with `language="cutdown"` is intentionally unsupported. Because fence length is fixed at exactly 3 backticks and nesting is not supported, there is no way to represent a ` ``` ` fence line as literal content. Authors who need to show Cutdown examples inside a Cutdown document SHOULD use a `:::example` Named Block; rendering is the consumer's responsibility.

```
AST: CodeBlock { language: string = "text", content: string, attributes: Attributes }
```

---

### 9.5 Meta block (Frontmatter)

**Syntax:** Fenced with exactly three tildes.

```
~~~format
content
~~~
```

- Opening fence: `~~~` optionally followed by a format identifier.
- Recognized formats: `yaml`, `toml`, `json` (case-insensitive). Default: `yaml`.
- Content: raw string — passed as-is to the consumer. Content lines are joined with `\n` and a single trailing `\n` is appended (ensuring the string is valid input for YAML/TOML/JSON parsers).
- Closing fence: `~~~` on its own line.
- Unclosed fence: content runs to end of document.
- **Inside block containers:** illegal. When a `~~~` fence opener is encountered inside a `ListItem`, `TaskItem`, `QuoteBlock`, or `NamedBlock`, the entire raw span — including the opening `~~~` line, all content lines, and the closing `~~~` line — is emitted as a single `Paragraph` with literal text. A warning-level diagnostic is emitted on the opening fence line.
- May appear anywhere **at Page scope**. Multiple Meta blocks are allowed.
- A Meta block always fills the current Page's `meta` field. If `Page.meta` is already set, the Meta block opens a new Page first, then fills that Page's `meta`. No Meta block ever appears in `Page.children`.
- No attributes supported on Meta blocks.

```
AST: Meta { format: "yaml"|"toml"|"json" = "yaml", raw: string }
```

**Meta Transclusion:** A Meta block may include an `include:` key listing paths to external files. Cutdown emits this as a normal `Meta` node. Resolution is the consumer's responsibility.

```
~~~yaml
include:
  - /path/to/other.yaml
  - /path/to/config.toml
  - /path/to/page.markdown   # only document meta extracted by consumer
~~~
```

---

### 9.6 QuoteBlock

**Syntax:** Lines prefixed with `>`.

```
> This is a quoted block.
> Still in the quote.
```

- Every line of the blockquote MUST begin with `>`.
- A parser MUST NOT treat a line without a leading `>` as a continuation of the blockquote. Such a line ends the quote and begins a new block.
- The `>` prefix and one optional following space are stripped from each line before parsing content.
- Content is parsed as full block content (paragraphs, lists, code blocks, nested quotes, etc.).
- Nesting: `>>` = blockquote inside blockquote. `>>>` = triple nesting, etc. Both `>>` and `> >` (with spaces between `>`) are valid nesting syntax. Nesting depth = count of leading `>` characters.
- `{attr}` trailing on the first `>` line attaches to the QuoteBlock. Only the first line's trailing `{attr}` is claimed by the block; subsequent lines' trailing `{attr}` follow inline attachment rules.

```
AST: QuoteBlock { children: Block[], attributes: Attributes }
```

---

### 9.7 Lists

#### 9.7.1 Unordered List

**Marker:** The list marker is the minus-hyphen character (`-`) only, followed by one space.

```
- Item one
- Item two
  - Nested item
```

- Nesting: determined by column comparison using the stack model (§9.7.5). Two spaces of indentation per level is a **style recommendation** only.
- The text following the marker on the same line is **parsed by inline rules (§10)**. The result is `Inline[]`. The `-` character has no special meaning inside inline content — `- - item` is a list item whose inline content is `Text("- item")`.

```
Input:  - - - nested item
AST:    ListItem { children: [Text("- - nested item")] }
```

#### 9.7.2 Ordered List

**Marker:** `{number}.` followed by one space.

```
1. First item
2. Second item
   1. Nested
```

- Only `.` delimiter supported. `)` is not a list marker.
- The actual number in the source is ignored. The AST carries a `start` attribute for the first item offset.
- The text following the marker on the same line is **parsed by inline rules (§10)**. The result is `Inline[]`. The `N.` pattern has no special meaning inside inline content — `1. 2. 3. item` is a list item whose inline content is `Text("2. 3. item")`.

```
Input:  1. 2. 3. nested item
AST:    ListItem { children: [Text("2. 3. nested item")] }
```

#### 9.7.3 Tight vs Loose

A list is **loose** if the parser absorbs a blank line within the list scope — i.e., a blank line followed by content at col > 0 that is claimed by the list (see §9.7.5). A loose list sets `loose: true` on the `List` node.

`loose` is an **advisory flag** — it records a structural fact about the source. Consumers MAY use it to influence rendering (e.g. wrapping items in `<p>` tags). Consumers MAY ignore it. The parser does not alter `ListItem` children based on looseness; the flag is purely informational.

Note: a blank line followed by a col-0 marker always ends the current list and starts a new `List` node — it does not make the first list loose. Loose lists require items with indentation (col > 0) so the blank line can be absorbed.

Trailing attr lines (lines consisting solely of `{attrs}` with no preceding blank line) are NOT treated as blank lines for loose detection purposes.

#### 9.7.4 Task Items

Task items are unordered list items prefixed with a checkbox marker. They emit `TaskItem` nodes carrying a `checked` boolean.

**Syntax:**

```
- [ ] Unchecked task
- [x] Checked task
- [X] Also checked
```

- Marker: `- ` followed immediately by `[ ]` (unchecked) or `[x]`/`[X]` (checked), then a space and inline content.
- Only unordered list items may carry a checkbox. An ordered list item never produces a `TaskItem`.
- A `List` may contain a mix of `ListItem` and `TaskItem` children.
- `TaskItem` follows the same multiline and block-promotion rules as `ListItem` (§9.7.5).

```
AST: TaskItem { checked: bool, children: (Block | Inline)[], attributes: Attributes }
```

**Example:**

```
Input:
  - [ ] Buy milk
  - [x] Write spec
  - plain item

AST:
  List { ordered: false, loose: false }
  ├── TaskItem { checked: false, children: [Text("Buy milk")] }
  ├── TaskItem { checked: true,  children: [Text("Write spec")] }
  └── ListItem { children: [Text("plain item")] }
```

**Mixed-type list rules:**

A single `List` node may mix `ListItem`, `TaskItem`, and numeric markers. The first item's marker determines `List.ordered`:

- If the first item is a `TaskItem` or unordered marker → `ordered: false`.
- If the first item is a numeric marker → `ordered: true`.

`TaskItem` identity is always preserved regardless of `List.ordered`.

When a `TaskItem` is first (list is unordered), any subsequent numeric markers are treated as unordered items and emit plain `ListItem` nodes.

```
Example A — numeric first, task item second:
  1. First ordered item
  - [ ] Task item

  AST: List { ordered: true }
  ├── ListItem { children: [Text("First ordered item")] }
  └── TaskItem { checked: false, children: [Text("Task item")] }

Example B — task first, numeric second:
  - [ ] Task item first
  1. Numeric becomes unordered

  AST: List { ordered: false }
  ├── TaskItem { checked: false, children: [Text("Task item first")] }
  └── ListItem { children: [Text("Numeric becomes unordered")] }
```

#### 9.7.5 List Indentation Model

Cutdown uses a **stack-based, column-relative** model for all list types (unordered, ordered, task). Nesting is determined by comparing marker columns, not by fixed indentation increments.

**Definitions:**
- The **column** of a line is its count of leading spaces before the first non-space character. Recorded from the original source before leading-space stripping (§8.2).
- The parser maintains a **nesting stack** of `(col, item)` pairs representing the currently open items from outermost to innermost.

**New marker at column C** (pop-then-push rule):
1. While the stack is non-empty and `C ≤ top.col`: pop.
2. Push the new item at column C.

A marker with `C > top.col` is a nested child (+1 depth). A marker with `C ≤ top.col` closes items until a shallower ancestor is found, then opens a sibling.

**Non-marker line (continuation text) at column C:**
1. While the stack depth ≥ 2 and `C < second-from-top.col`: pop.
2. Continue the now-current item.

Depth-0 items (no parent on the stack) accept any non-blank non-marker line unconditionally (threshold = −∞).

**Blank lines:**
- Blank line followed by content at **col 0** → block boundary. The current `List` node ends. If the next line is a list marker, a new `List` node begins.
- Blank line followed by content at **col > 0** → absorbed by the list parser. The stack persists. A list marker continues the list via the pop-then-push rule; a non-marker line becomes block content inside the current item (`ListItem.children` becomes `Block[]`). The `List` is marked `loose: true`.

**Style note:** Two spaces of indentation per nesting level is recommended. The parser accepts any positive column delta as a valid nesting step; the stack model resolves all cases unambiguously.

**Inline content and continuation lines:** The text content on a marker line (after the `- ` or `N. ` marker) and any subsequent continuation lines are all parsed by inline rules (§10). A continuation line at col > 0 that is claimed by a depth-0 item (col 0) is absorbed unconditionally — depth-0 items have no threshold and accept any non-blank non-marker line.

```
Input:
  - - - nested item
        whom belongs the line?

AST:
  List { ordered: false }
  └── ListItem { children: [Text("- - nested item whom belongs the line?")] }
```

(The continuation at col 8 is absorbed by the depth-0 item. Soft-break: trailing space on line 1 preserves word boundary; without trailing space, lines concatenate directly.)

```
Input (standard):
  - item 0.0
  - item 1.0
    - item 1.1
    - item 1.2

AST:
  List { ordered: false, loose: false }
  ├── ListItem { Text("item 0.0") }
  └── ListItem { Text("item 1.0") }
      └── List { ordered: false, loose: false }
          ├── ListItem { Text("item 1.1") }
          └── ListItem { Text("item 1.2") }
```

```
Input (arbitrary indentation — stack resolves):
          - item 0.0   ← col 10, base; stack: [(10, 0.0)]
        continuation   ← col 8, depth-0 → continues 0.0
      - item 1.0       ← col 6, 6≤10 → pop; push; stack: [(6, 1.0)]
            - item 1.1 ← col 12, 12>6 → push; stack: [(6, 1.0),(12, 1.1)]
         content 1.1   ← col 9, parent.col=6, 9≥6 → continues 1.1
     content 1.0 lvl   ← col 5, parent.col=6, 5<6 → pop 1.1; depth-0 → continues 1.0

AST:
  List { ordered: false, loose: false }
  ├── ListItem
  |   └── Text("item 0.0continuation")
  └── ListItem
      ├── Text("item 1.0")
      ├── List { ordered: false, loose: false }
      |   └── ListItem { Text("item 1.1 content 1.1") }
      └── Text ("content 1.1")
```

```
Input (loose list — absorbed blank line):
  - First item
    continues here
  - Second item

    This starts a new paragraph inside item two.

    - Nested item

AST:
  List { ordered: false, loose: true }
  ├── ListItem
  │   └── Text("First item continues here")
  └── ListItem
      ├── Paragraph("Second item")
      ├── Paragraph("This starts a new paragraph inside item two.")
      └── List { ordered: false, loose: false }
          └── ListItem
              └── Text("Nested item")
```

For `{attr}` on list items, see the scope-chain rule in §5.2.

---

### 9.8 Tables

Two table variants are supported, distinguished by the presence of a delimiter row.

#### 9.8.1 Simple Pipe Table

No delimiter row. All rows are body rows. No header.

```
| Cell A | Cell B |
| Cell C | Cell D |
```

#### 9.8.2 GFM Table

A delimiter row follows the first (header) row.

```
| Name   | Score |
|:-------|------:|
| Alice  |    42 |
| Bob    |    17 |
```

**Delimiter row alignment syntax:**

| Delimiter | Alignment |
|-----------|-----------|
| `\|------|` | none (default left) |
| `\|:-----|` | left |
| `\|-----:|` | right |
| `\|:----:|` | center |
| `\|-----,|` | comma (thousands separator style) |
| `\|-----.|` | decimal (decimal point alignment) |

Rendering of comma and decimal alignment is the consumer's responsibility.

#### 9.8.3 Table Rules

- Cell content is **parsed by inline rules (§10)**. The result is `Inline[]`.
- Colspan and rowspan are not supported.
- Pipe-less table syntax is **not supported**. Leading and trailing `|` are required and MUST be consistent within a table.
- `Cell` and `Column` do not carry `attributes`.

**Row and Table attributes** follow the scope-chain rule (§5, Rule B) with a 2-slot chain: the last `{}` goes to `Table`, the preceding `{}` goes to `Row`. However, the `Table` slot is only available from the **last row's** chain — mid-table rows have 1 slot (`Row`) only.

`{attr}` blocks may appear trailing on the same line as the row (after the closing `|`), or on one or more immediately following lines (no blank line between), following the single-NL transparency rule.

```
| td1 | td2 | {.a}{.b}   →  Table({.b}, Row({.a}, Cell(td1), Cell(td2)))
| td1 | td2 | {.a}       →  Table({.a}, Row(...))          ← single {} = Table slot
| td1 | td2 | {.a}{}     →  Table({},   Row({.a}, ...))    ← {} no-op on Table; {.a} to Row
| td1 | td2 |
{.a}{.b}                 →  Table({.b}, Row({.a}, ...))    ← multiline equivalent
| td1 | td2 |
{.a}
{.b}                     →  Table({.b}, Row({.a}, ...))    ← same

Mid-table (not last row):
| td1 | td2 | {.a}       →  Row({.a}, ...)                 ← 1 slot only
| td1 | td2 | {.a}{.b}   →  Row({.b}, ...)   {.a} dropped  ← 1 slot; extra dropped
```

```
AST:
  Table {
    kind:        "simple" | "gfm",
    head:        Row[] | null,
    body:        Row[],
    columns:     Column[],
    attributes:  Attributes
  }

  Row {
    children:   Cell[],
    attributes: Attributes
  }

  Cell {
    children: Inline[],
    row:      number,    ← zero-indexed
    column:   number     ← zero-indexed
  }

  Column {
    align: "left" | "right" | "center" | "comma" | "decimal"
           ← default: "left" (no null value)
  }
```

Note: `Cell` does not carry an `align` field — consumers derive alignment from the corresponding `Column`.

---

### 9.9 File References

Any line beginning with `/` is a **file reference block**.

**Syntax:** `/path/to/file.ext {attrs}`

- Leading `/` is mandatory.
- The path uses `PATH_LITERAL` characters (§1): `[a-zA-Z0-9._/-]`. Path traversal (`/../`) is allowed. Cutdown does not validate paths.
- Optional attributes after the path (separated by at least one space).

**Fragment identifier (`#`):** If the path contains `#`, everything from the first `#` to the next space (or end of line, before `{attrs}`) is extracted as the fragment. `src` stores the portion before `#`; `fragment` stores the portion after `#`.

```
/path/to/page.cutdown#section-id
→ FileRef { src: "/path/to/page.cutdown", fragment: "section-id" }
```

**Query string (`?`):** `?` and everything after it (up to a space or `#`) is included in `src` verbatim. No separate `query` field is produced. The `?` character is not special to the Cutdown parser — query string interpretation is the consumer's responsibility.

```
/path/to/file.ext?q=value
→ FileRef { src: "/path/to/file.ext?q=value", fragment: null }

/path/to/file.ext?q=value#section
→ FileRef { src: "/path/to/file.ext?q=value", fragment: "section" }
```

```
AST: FileRef { src: string, fragment: string|null, group: "image"|"video"|"audio"|null, attributes: Attributes }
```

#### 9.9.1 Known Groups

The parser checks the file extension against known groups:

| Group | Extensions |
|-------|-----------|
| `image` | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.svg` |
| `video` | `.mp4` `.avi` `.mov` |
| `audio` | `.mp3` `.wav` `.aac` `.ogg` |
| (none) | all other extensions |

The extension list for each group is configurable by the consumer. The above are defaults.

#### 9.9.2 Grouping

Consecutive `FileRef` lines belonging to the **same known group** (with no blank line between them) are wrapped in a `FileRefGroup`.

```
AST: FileRefGroup { group: "image"|"video"|"audio", children: (FileRef | ImageBlock)[] }
```

Rules:
- Grouping only applies to known-group extensions.
- Different groups do NOT merge. Two consecutive lines of different groups produce two separate nodes.
- Unknown extension files (`group: null`) are never grouped.
- A blank line breaks any active group.

**Example:**

```
Input:
  /photos/a.png
  /photos/b.jpg
  /docs/report.pdf
  /media/clip.md
  /photos/c.png

AST:
  FileRefGroup(image)
  ├── FileRef { src: "/photos/a.png", group: "image" }
  └── FileRef { src: "/photos/b.jpg", group: "image" }
  FileRef { src: "/docs/report.pdf", group: null }
  FileRef { src: "/media/clip.md", group: null }
  FileRefGroup(image)
  └── FileRef { src: "/photos/c.png", group: "image" }
```

#### 9.9.3 ImageBlock

A line at block level beginning with `![` is classified as an `ImageBlock`.

The `alt` content is **parsed by inline rules (§10)**. The result is `Inline[]`.

```
AST: ImageBlock { alt: Inline[], src: string, attributes: Attributes }
```

Consecutive `ImageBlock` lines with no blank line between them are wrapped in a `FileRefGroup { group: "image" }`. The `FileRefGroup` may contain `FileRef` or `ImageBlock` children when `group` is `"image"`.

`{attr}` on an `ImageBlock` line: trailing on the same line.
`{attr}` for an `ImageGroup` (FileRefGroup of images): trailing rule after last item line (no blank line).

#### 9.9.4 Content Transclusion

Files with extensions `.cutdown`, `.markdown`, or `.md` are emitted as `FileRef { group: null }`. The consuming application is responsible for loading and embedding the referenced document's content. Each included document carries its own document outline.

A fragment identifier targets a specific section:

```
/path/to/page.cutdown#section-id
```

→ `FileRef { src: "/path/to/page.cutdown", fragment: "section-id", group: null }`

---

### 9.10 Named Block

**Syntax:**

```
:::block-name {attrs}
  content
:::
```

- Opening: `:::` followed immediately by a block name, then optional attributes.
- Closing: `:::` on its own line (no name).
- Block name pattern: `[ID_LITERAL]+` (see §1), immediately after `:::` with no space. A `:::` opener not followed immediately by an `[ID_LITERAL]` character (e.g. `::: {.attr}` or `:::` alone) does NOT open a NamedBlock — the block candidate is classified as a Paragraph and CDN-0013 is emitted.
- Content: any block content, including nested `:::` containers.
- Unclosed container: content runs to end of document.

> **Document Outline note:** In the Document Outline (a derived view — see §7.4), each `NamedBlock` is treated as a named section entry within its containing Page. This is distinct from `Section` nodes produced by headings. Consumers that build a Document Outline SHOULD include `NamedBlock` names as outline entries.

```
AST: NamedBlock { name: string, attributes: Attributes, children: Block[] }
```

**Indentation collapsing inside NamedBlock:** The first content line inside a `:::` container establishes the base indentation level (its leading space count). That many spaces are stripped from all content lines before parsing. Lines with fewer leading spaces than the base have all available leading spaces stripped. The closing `:::` is recognized regardless of its own leading indentation.

```
:::bb
  > qa
  > qb
:::
→ NamedBlock("bb", [QuoteBlock([Text("qa"), Text("qb")])])

:::bb
  - la
    - lb
:::
→ NamedBlock("bb", [List(ListItem([Text("la"), List(ListItem([Text("lb")]))]))])
```

**Nesting example:**

```
:::outer

:::inner
  text
:::

:::
```

```
AST:
  NamedBlock(name="outer")
  └── NamedBlock(name="inner")
      └── Paragraph("text")
```

---

### 9.11 Reference Definition

**Syntax:** `[^id]: inline content`

- MUST start at the beginning of a line.
- `id` may contain `[ID_LITERAL]+` (see §1). Case-sensitive.
- Content is **parsed by inline rules (§10)**. The result is `Inline[]`.
- Multiple definitions with the same `id`: last definition wins; earlier ones are discarded. This is intentional: a host document can override any definition from a transcluded fragment by placing its own definition after the include point. First-wins would make override order depend on fragment inclusion order, which is unpredictable.
- Cutdown does not validate that every `[^id]` link has a matching definition.

```
AST: RefDefinition { id: string, children: Inline[], attributes: Attributes }
```

---

### 9.12 Block Math Formula

**Syntax:** Fenced with exactly three dollar signs.

```
$$$ {attrs}
\pm\sqrt{a^2 + b^2}
$$$
```

- Opening fence: `$$$` optionally followed by attributes.
- Content: **literal** — no inline parsing is performed. Passed as raw string to the consumer (KaTeX or equivalent). Content lines are joined with `\n`; no trailing `\n` is appended. Blank lines within the fence are preserved verbatim.
- Closing fence: `$$$` on its own line.
- Unclosed fence: content runs to end of document.
- Attributes on opening line follow standard attribute syntax (§5).
- **Inside block containers:** legal. Closing fence recognised after leading-space stripping. Content indentation handling follows the same rules as `CodeBlock` (§9.4): `ListItem`/`TaskItem`/`NamedBlock` strip their base offset; `QuoteBlock` strips only the `>` prefix.

```
AST: MathBlock { formula: string, attributes: Attributes }
```

**Example:**

```
Input:
  $$$ {.display #eq1}
  \int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
  $$$

AST:
  MathBlock {
    formula: "\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}",
    attributes: { id: "eq1", class: ["display"] }
  }
```

---

### 9.13 Comments

See §8.3. Comments produce no AST node and are not listed in the document's block children.

---
