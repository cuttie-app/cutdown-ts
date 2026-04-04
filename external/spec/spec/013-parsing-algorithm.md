## 13. Parsing Algorithm

Cutdown uses a **single-pass** parsing strategy. A conforming parser MUST NOT backtrack: once a token or node has been emitted, it is never re-interpreted. An opener with no valid closer before the end of the inline context is emitted as literal text and parsing continues forward.

### 13.1 Phase 1 — Normalization

1. Validate UTF-8.
2. Normalize line endings to `\n`.
3. Normalize tab characters outside fenced blocks to a single space.

### 13.2 Phase 2 — Block Identification

1. Split input into lines.
2. Strip comment lines (lines where first character is `#`).
3. Identify block boundaries: a sequence of non-blank lines bounded by blank lines (or document start/end) is a **block candidate**.
4. Special blocks that override blank-line boundaries:
   - Code fences: ` ``` ` opens until the next ` ``` ` (or end of document).
   - Meta blocks: `~~~` opens until the next `~~~` (or end of document).
   - Named blocks `:::` open until a closing `:::` (or end of document).
   - Math blocks: `$$$` opens until the next `$$$` (or end of document).

### 13.3 Phase 3 — Block Classification

Each block candidate is classified by its first line:

| First line matches | Block type |
|-------------------|------------|
| `^(={1,9}) ` | Heading → Section |
| `^---` | ThematicBreak |
| `^` ``` ` | CodeBlock |
| `^~~~` | Meta |
| `^:::[ID_LITERAL]` | NamedBlock |
| `^\|` | Table |
| `^> ` | QuoteBlock |
| `^- ` or `^- \[[ x]\] ` | List (unordered / task) |
| `^[0-9]+\. ` | List (ordered) |
| `^\[^[ID_LITERAL]` | RefDefinition |
| `^\$\$\$` | MathBlock |
| `^/` | FileRef |
| `^!\[` | ImageBlock |
| (anything else) | Paragraph |

### 13.4 Phase 4 — Inline Parsing

Inline content is parsed left-to-right within each block that contains inline content. The parser:

1. Scans for openers (`**`, `__`, `~~`, '\`\`', `[`, `![`, `::`, `{{`, `""`, `''`, `$$`).
2. On finding an opener, scans forward for a valid closer.
3. If no closer found before paragraph/block end: emits opener as `Text` and advances.
4. Resolves escape sequences `\x` before delimiter matching.
5. Collects trailing `{attrs}` after each completed inline element.

Reference links (`[text][^ref]`) are emitted as `Link { kind: "ref" }` in-place. Resolution against `RefDefinition` nodes is the consumer's responsibility.

Citation links (`[text][@cite]`, including `[][@cite]`) are emitted as `Link { kind: "cite" }` in-place. Citation resolution is the consumer's responsibility.

### 13.5 Section Assembly

After all blocks are classified, heading blocks are used to assemble `Section` nodes. Section Assembly runs **recursively** — it applies to the Page-level block list and independently to the child list of every block container (`ListItem`, `TaskItem`, `QuoteBlock`, `NamedBlock`).

For each block list (Page-level or container-level):

1. Walk the list left-to-right.
2. On encountering a heading of level `n`: close all open sections of level ≥ `n` within this list, then open a new `Section(level=n)`.
3. All subsequent non-heading blocks belong to the innermost open section.
4. All open sections are closed at the end of the list. Section scope never crosses the container boundary.

### 13.6 Page Assembly

Pages are assembled during block classification (Phase 3). Page Assembly applies **only at Page scope** — blocks inside containers (`ListItem`, `TaskItem`, `QuoteBlock`, `NamedBlock`) never trigger Page Assembly regardless of their type.

1. The document begins with `Page[0]`, initially empty (`meta: null`, `children: []`).
2. On encountering a `Meta` block **at Page scope**:
   - If the current Page's `meta` is `null`: assign this Meta block to `Page.meta`. No new Page is created.
   - Otherwise: close the current Page, open a new Page, assign the Meta block to the new Page's `meta`.
3. On encountering a `ThematicBreak` **at Page scope**: close the current Page, open a new Page, place the `ThematicBreak` as the first child of the new Page.
4. A `ThematicBreak` inside a block container emits a `ThematicBreak` node within that container but does not affect Page Assembly.
5. All other blocks are appended to the current Page's `children`.
6. Ghost Pages (`meta: null`, `children: []`) are valid and emitted as-is. Consumers decide how to handle them.

---
