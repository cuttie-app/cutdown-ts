## 7. Document Model

A Cutdown document is a tree rooted at a `Document` node.

```
Document {
  children: Page[]
}

Page {
  meta:     Meta | null
  children: (ThematicBreak | Section | Block)[]
}
```

### 7.1 Sections

A `Section` is created by a heading. It contains all subsequent blocks until a heading of equal or lesser level is encountered, or until the end of the current Page (ThematicBreak or Meta-triggered page break). Sections never cross Page boundaries.

```
Section {
  level:    1..9,
  heading:  Inline[],
  attributes: Attributes,
  children: (Section | Block)[]
}
```

Sections nest by level. A level-2 heading inside a level-1 section creates a child section. A level-1 heading closes all open sections and opens a new one at the root.

### 7.2 Sections inside Block Containers

`Section` nodes may appear inside block containers: `ListItem`, `TaskItem`, `QuoteBlock`, and `NamedBlock`. All of these have children typed as `(Section | Block)[]`.

Section scoping inside a block container follows the same level-based open/close logic as at Page level (§13.5), but is **bounded by the container**:

- A Section opened inside a container cannot extend beyond that container's closing boundary.
- Headings inside a container have no effect on the Section hierarchy outside the container.
- Section Assembly (§13.5) runs independently on each container's child list.

```
Input:
  - intro

    = Inner Section

    paragraph

  - next item

  paragraph after list

AST:
  List
  ├── ListItem
  │   └── Section(level=1, "Inner Section")
  │       └── Paragraph("paragraph")
  └── ListItem { Text("next item") }
  Paragraph("paragraph after list")   ← belongs to outer scope, unaffected
```

### 7.3 Headingless Documents

A document with no headings is valid. Its root `Document` node contains `Page[]` children. Each Page may contain `Block[]` children directly.

### 7.4 Section Boundary Example

```
Input:
  = Title

  Some paragraph.

  == Sub A

  Content A.

  == Sub B

  Content B.

  = Next Title

AST:
  Document
  ├── Section(level=1, "Title")
  │   ├── Paragraph("Some paragraph.")
  │   ├── Section(level=2, "Sub A")
  │   │   └── Paragraph("Content A.")
  │   └── Section(level=2, "Sub B")
  │       └── Paragraph("Content B.")
  └── Section(level=1, "Next Title")
```

### 7.5 Pages

Every document has at least one Page. Pages are the top-level children of the Document node.

- Page breaks are created by `ThematicBreak` or a `Meta` block.
- A `ThematicBreak` creates a new Page; it becomes the first child of that new Page.
- A `Meta` block fills the current Page's `meta` field. If `Page.meta` is already set, the Meta block first opens a new Page, then fills that new Page's `meta`. Otherwise it fills the current Page's `meta` in place — no new Page is created.
- The **Document Outline** is an abstract derived view (not an AST node) used in this spec to describe the logical hierarchy of Pages, Sections, and named blocks. Consumers derive it from the AST.

**Ghost Page:** A `Page` node with `meta: null` and `children: []`. Not a distinct AST type — a valid `Page` node. Ghost Pages arise in exactly two cases:
(a) The document is empty (zero bytes) — the parser emits one Ghost Page.
(b) A `ThematicBreak` opens a new Page that receives no content before the next `ThematicBreak` or end of document.

Meta blocks cannot produce Ghost Pages — they always fill `Page.meta`.

---
