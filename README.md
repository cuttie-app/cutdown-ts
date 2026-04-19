# cutdown-parser – TypeScript lib and CLI

TypeScript parser for the Cutdown markup language.

## What is Cutdown?

Cutdown is a markup language derived from Markdown that makes one radical trade: naturalness for predictability. Every construct is locally deterministic — block classification from the first line alone, inline parsing left-to-right with no backtracking, no global document state affecting any parse decision. Doubled delimiters (\*\*bold\*\*, \`\`code\`\`, \~\~strike\~\~) replace CommonMark's 17-rule emphasis algorithm entirely: a single \* is always literal text, a doubled \*\* always opens a span, and the rule holds everywhere without flanking logic or context sensitivity.

Octothorpe `#` becomes a first-class comment marker — stripping from output like YAML and most programming languages — while equal sign `=` takes headings, readable and reachable on every keyboard layout. Angle brackets carry no special meaning, so the HTML injection surface simply doesn't exist. Block elements cannot interrupt a paragraph, making hard-wrapped prose safe.

No typographic substitution, no entity decoding, no silent transforms, no double-space magic — what the author typed is what the AST contains, and what the AST contains is exactly what each consumer gets to interpret.

[`cutdown-spec`](https://github.com/cuttie-app/cutdown-spec) defines the language; `cutdown-ts` is its first conforming parser.

## Install

```bash
npm install cutdown-parser
# or
pnpm add cutdown-parser
```

## Usage

```typescript
import { parse } from 'cutdown-parser'

const input = `
== Article Heading

That's how we start paragraph.`

const ast = parse(input)
//     ^ ASTResult<NodeMap>
```

`ast -> JSON -> YAML`:

```yaml
ast:
  type: Document
  children:
    - meta: null
      children:
        - type: Section
          level: 2
          heading:
            - type: Text
              value: Article Heading
          attributes: []
          children:
            - type: Paragraph
              children:
                - type: Text
                  value: That's how we start paragraph.
                  attributes: []
```

## Specification

[Quick reference → `SYNTAX.md`](Shttps://github.com/cuttie-app/cutdown-spec/blob/main/SYNTAX.md) · [Full spec → `spec/TOC.md`](https://github.com/cuttie-app/cutdown-spec/blob/main/spec/TOC.md)

The parser behavior is governed by the [Cutdown ML Specification](https://github.com/cuttie-app/cutdown-spec). For conformance details, versioning policy, and diagnostic codes, refer to the spec repository.

Edge cases and acceptance criteria are defined in the spec's test suite: [Cutdown ML Specification / tests](https://github.com/cuttie-app/cutdown-spec/tree/main/tests). The parser is tested against all official test cases to ensure compliance.

## API Reference

```ts
import { parse, pipeline, ASTResult } from 'cutdown-parser'

import type {
  // Parse output
  ParseResult,
  Document,
  Page,

  // Block segments
  Block,
  Section,
  Paragraph,
  ThematicBreak,
  CodeBlock,
  QuoteBlock,
  List,
  Table,
  ColumnAlign,
  FileRef,
  FileRefGroup,
  ImageBlock,
  FileGroup,
  NamedBlock,
  MathBlock,

  // Inline segments
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
  QuoteInline,

  // Special segments
  Meta,
  RefDefinition,
  ListItem,
  TaskItem,
  Column,
  Row,
  Cell,
  Variable,

  // Attributes & diagnostics
  Attribute,
  AttributeValue,
  AttrsParseResult,
  Diagnostic,
  DiagnosticLevel,

  // Pipeline
  NodeMap,
  Visitors,
  Plugin,
  PluginDelta,
  Apply,
} from 'cutdown-parser'
```

---

### `parse(input: string): ASTResult<NodeMap>`

Parses a Cutdown string and returns an `ASTResult`. Synchronous, no I/O.

```ts
const result = parse('= Hello **world**')
//     ^ ASTResult<NodeMap>

result.ast            // Document
result.diagnostics    // Diagnostic[]
result.walk({ ... })  // typed exit-visitor traversal
```

---

### `ASTResult<TMap>`

Returned by `parse()` and `pipeline()(...)`. Holds the document tree and any diagnostics emitted during parsing.

| Property / Method | Type           | Description                                                       |
| ----------------- | -------------- | ----------------------------------------------------------------- |
| `.ast`            | `Document`     | Root node of the parsed document                                  |
| `.diagnostics`    | `Diagnostic[]` | Warnings and errors (CDN codes)                                   |
| `.walk(visitors)` | `void`         | Exit-only traversal; visitor returns a replacement node or `void` |

`walk()` is typed to `TMap` — after `pipeline()` folds in plugins, visitor arguments narrow to the enriched node shapes the plugins declared.

---

### `pipeline(parse, plugins): (input) => ASTResult<...>`

Composes the parser with an ordered list of plugins. Each plugin runs exit-only visitors over the AST after parsing. The return type accumulates the type-level enrichments from each plugin's `PluginDelta`.

```ts
const enrichedParse = pipeline(parse, [linkPlugin, mentionPlugin])
const result = enrichedParse('Hello @world')
//     ^ ASTResult<Apply<NodeMap, [linkPlugin.delta, mentionPlugin.delta]>>

result.walk({
  Link: (node) => {
    /* node is EnrichedLink if plugin declared it */
  },
})
```

---

### AST node types

#### Document structure

| Type       | Key fields                                |
| ---------- | ----------------------------------------- |
| `Document` | `children: Page[]`                        |
| `Page`     | `meta: Meta \| null`, `children: Block[]` |

#### Block nodes

| Type            | Key fields                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Section`       | `level: number`, `heading: Inline[]`, `children: Block[]`, `attributes`                                                            |
| `Paragraph`     | `children: Inline[]`, `attributes`                                                                                                 |
| `ThematicBreak` | `attributes`                                                                                                                       |
| `CodeBlock`     | `language: string`, `raw: string`, `attributes`                                                                                    |
| `Meta`          | `format: string`, `raw: string`                                                                                                    |
| `QuoteBlock`    | `children: Block[]`, `attributes`                                                                                                  |
| `List`          | `kind: 'bullet' \| 'numbered' \| 'checklist'`, `start: number \| null`, `loose: boolean`, `children: ListItemLike[]`, `attributes` |
| `ListItem`      | `children: (Block \| Inline)[]`, `attributes?`                                                                                     |
| `TaskItem`      | `checked: boolean`, `children: (Block \| Inline)[]`, `attributes`                                                                  |
| `Table`         | `kind: TableKind`, `head: Row[]`, `body: Row[]`, `columns: Column[]`, `attributes`                                                 |
| `Row`           | `children: Cell[]`, `attributes`                                                                                                   |
| `Cell`          | `row: number`, `column: number`, `children: Inline[]`                                                                              |
| `Column`        | `align: ColumnAlign`                                                                                                               |
| `FileRef`       | `path: string`, `query: string`, `fragment: string`, `attributes`                                                                  |
| `ImageBlock`    | `alt: Inline[]`, `src: string`, `attributes`                                                                                       |
| `FileRefGroup`  | `group: FileGroup`, `children: (FileRef \| ImageBlock)[]`, `attributes`                                                            |
| `NamedBlock`    | `name: string`, `children: Block[]`, `attributes`                                                                                  |
| `RefDefinition` | `id: string`, `children: Inline[]`, `attributes`                                                                                   |
| `MathBlock`     | `raw: string`, `attributes`                                                                                                        |

#### Inline nodes

| Type            | Key fields                                                                             |
| --------------- | -------------------------------------------------------------------------------------- |
| `Text`          | `value: string`                                                                        |
| `Emphasis`      | `children: Inline[]`, `attributes`                                                     |
| `Strong`        | `children: Inline[]`, `attributes`                                                     |
| `Strikethrough` | `children: Inline[]`, `attributes`                                                     |
| `CodeInline`    | `value: string`, `attributes`                                                          |
| `TextBreak`     | _(no fields)_                                                                          |
| `Link`          | `kind: LinkKind`, `href: string`, `target: string`, `children: Inline[]`, `attributes` |
| `ImageInline`   | `alt: Inline[]`, `src: string`, `attributes`                                           |
| `Span`          | `name: string`, `children: Inline[]`, `attributes`                                     |
| `MathInline`    | `formula: string`, `attributes`                                                        |
| `Variable`      | `key: string`, `attributes`                                                            |
| `QuoteInline`   | `kind: 'double' \| 'single'`, `children: Inline[]`, `attributes`                       |

#### Discriminant unions

```ts
type Block =
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
  | MathBlock

type Inline =
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
  | QuoteInline

type LinkKind = 'external' | 'page' | 'tag' | 'ref' | 'cite'
type TableKind = 'simple' | 'gfm'
type ColumnAlign = 'left' | 'right' | 'center' | 'comma' | 'decimal'
type FileGroup = 'image' | 'video' | 'audio'
```

In contrast to CommonMark's 3-level node hierarchy (Block / Container / Inline), Cutdown has a flat registry of 31 distinct node types. Even `Block` and `Inline` doesn't cover all segments. `Meta`,`RefDefinition`,`ListItem`,`TaskItem`,`Column`,`Row`,`Cell`,`Variable` are all special segments. Each segment has a `type` field that discriminates its shape, and visitors in plugins can narrow on that type for precise transformations.

---

### Attributes

Every node that carries `attributes: Attribute[]` uses this shape:

```ts
type Attribute =
  | { key: 'id'; value: string } // {#my-id}
  | { key: 'class'; value: string[] } // {.foo .bar}
  | { key: string; value: string } // {key=value} or bare {flag}
```

---

### Diagnostics

```ts
interface Diagnostic {
  code: string // CDN-XXXX code from the spec
  level: 'warning' | 'error'
  message?: string
}
```

Diagnostics are collected during parsing and never thrown. Check `result.diagnostics` after every parse in strict pipelines.

As for now Spec describes apostates that emits diagnostics with level=`warning` only, but the structure allows for `error` level diagnostics in the future if needed. As for now Spec (and this parser) tries read document as best as it can, never throwing or bailing on errors. This is a core principle of Cutdown design — robustness and predictability over strictness. Even in the presence of malformed syntax, the parser produces an AST and a list of diagnostics without throwing exceptions.

---

### Plugin system

```ts
interface Plugin<TDelta extends PluginDelta = PluginDelta> {
  readonly delta?: TDelta // type-only: declares which node types are enriched
  readonly visitors: Visitors<NodeMap>
}

type Visitors<TMap> = { [K in keyof TMap]?: (node: TMap[K]) => TMap[K] | void }
```

`PluginDelta` is `Partial<NodeMap>` — a partial map that replaces segment types in the accumulated `TMap`. `Apply<NodeMap, [P1, P2]>` folds deltas left-to-right at the type level, so `walk()` visitors on the final result are typed to the enriched shapes.

---

### `NodeMap`

Flat registry of all 31 visitable segment types, keyed by their `type` discriminant. Used as the base type parameter throughout the pipeline system. Rarely needed directly — it is the default `TMap` on `ASTResult<NodeMap>` and the constraint for `Visitors` and `PluginDelta`.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to the parser, including version policies tied to the specification.

## License

License: [MIT](LICENSE)
