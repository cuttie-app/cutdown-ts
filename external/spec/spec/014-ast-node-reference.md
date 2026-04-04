## 14. AST Node Reference

### Block Nodes

| Node            | Fields                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| `Document`      | `children: Page[]`                                                                           |
| `Page`          | `meta: Meta\|null, children: (ThematicBreak\|Section\|Block)[]`                              |
| `Section`       | `level: 1..9, heading: Inline[], attributes, children: (Section\|Block)[]`                   |
| `Paragraph`     | `children: Inline[], attributes`                                                             |
| `ThematicBreak` | `attributes`                                                                                 |
| `CodeBlock`     | `language: string = "text", content: string, attributes`                                     |
| `Meta`          | `format: "yaml"\|"toml"\|"json" = "yaml", raw: string`                                       |
| `QuoteBlock`    | `children: (Section\|Block)[], attributes`                                                   |
| `List`          | `ordered: bool, start: int\|null, loose: bool, children: (ListItem\|TaskItem)[], attributes` |
| `ListItem`      | `children: (Section\|Block\|Inline)[], attributes`                                           |
| `TaskItem`      | `checked: bool, children: (Section\|Block\|Inline)[], attributes`                            |
| `Table`         | `kind: "simple"\|"gfm", head: Row[]\|null, body: Row[], columns: Column[], attributes`       |
| `Row`           | `children: Cell[], attributes`                                                               |
| `Cell`          | `children: Inline[], row: number, column: number`                                            |
| `Column`        | `align: "left"\|"right"\|"center"\|"comma"\|"decimal" = "left"`                              |
| `FileRef`       | `src: string, fragment: string\|null, group: "image"\|"video"\|"audio"\|null, attributes`    |
| `ImageBlock`    | `alt: Inline[], src: string, attributes`                                                     |
| `FileRefGroup`  | `group: "image"\|"video"\|"audio", children: (FileRef\|ImageBlock)[], attributes`            |
| `NamedBlock`    | `name: string, attributes, children: (Section\|Block)[]`                                     |
| `RefDefinition` | `id: string, children: Inline[], attributes`                                                 |
| `MathBlock`     | `formula: string, attributes`                                                                |

### Inline Nodes

| Node            | Fields                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Text`          | `value: string`                                                                                                            |
| `Emphasis`      | `children: Inline[], attributes`                                                                                           |
| `Strong`        | `children: Inline[], attributes`                                                                                           |
| `Strikethrough` | `children: Inline[], attributes`                                                                                           |
| `CodeInline`    | `value: string, attributes`                                                                                                |
| `TextBreak`     | —                                                                                                                          |
| `Link`          | `kind: "external"\|"page"\|"tag"\|"ref"\|"cite", children: Inline[], href: string\|null, target: string\|null, attributes` |
| `ImageInline`   | `alt: Inline[], src: string, attributes`                                                                                   |
| `Span`          | `name: string, attributes, children: []`                                                                                   |
| `MathInline`    | `formula: string, attributes`                                                                                              |
| `Variable`      | `key: string, attributes`                                                                                                  |
| `QuoteInline`   | `kind: "double"\|"single", children: Inline[], attributes`                                                                 |

### Renamed Fields (v0.1.2 → v0.1.3)

- `Link.text` → `Link.children`
- `Image` (inline node) → `ImageInline`
- `Row.cells` → `Row.children`
- `RefDefinition.content` → `RefDefinition.children`
- `AnonymousBlock` → `NamedBlock`
- `CodeBlock { language: string|null }` → `CodeBlock { language: string = "text" }`
- `Column { align: ...|null }` → `Column { align: ... = "left" }`

### Attributes Type

```
Attributes = Attribute[] | null

Attribute =
  | { key: "id",    value: string }
  | { key: "class", value: string[] }
  | { key: string,  value: string }   // value: "" for bare-key tokens
```

`null` means no attribute block was present in source. An empty `[]` means an explicit empty block `{}` was authored.

Ordering: entries appear in **source order**. Deduplication rules (see §5.1) may drop entries before the array is emitted.

---
