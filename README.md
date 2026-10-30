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
_type: Document
children:
  - _type: Page
    meta: null
    reflections: []
    children:
      - _type: Section
        level: 2
        heading:
          - _type: Text
            value: Article Heading
        children:
          - _type: Paragraph
            children:
              - _type: Text
                value: That's how we start paragraph.
            attributes: []
            reflections: []
        attributes: []
        reflections: []
```

## Specification

[Quick reference → `SYNTAX.md`](https://github.com/cuttie-app/cutdown-spec/blob/main/SYNTAX.md) · [Full spec → `spec/TOC.md`](https://github.com/cuttie-app/cutdown-spec/blob/main/spec/TOC.md)

The parser behavior is governed by the [Cutdown ML Specification](https://github.com/cuttie-app/cutdown-spec). For conformance details, versioning policy, and diagnostic codes, refer to the spec repository.

Edge cases and acceptance criteria are defined in the spec's test suite: [Cutdown ML Specification / tests](https://github.com/cuttie-app/cutdown-spec/tree/main/tests). The parser is tested against all official test cases to ensure compliance.

## API Reference

```ts
import { parse, pipeline, ASTResult, LANGUAGE_VERSION } from 'cutdown-parser'

import type {
  // Document structure
  Document,
  Page,

  // Block segments
  Block,
  Section,
  Paragraph,
  CodeBlock,
  MathBlock,
  QuoteBlock,
  List,
  Table,
  FileGroup,
  EmbedBlock,
  InjectBlock,
  NamedBlock,
  SpoilerBlock,
  RefDefinition,

  // Inline segments
  Inline,
  Text,
  Emphasis,
  Strong,
  Highlight,
  Spoiler,
  Link,
  LinkKind,
  CodeInline,
  MathInline,
  QuoteInline,
  ImageInline,
  EmbedImageInline,
  Mark,
  LineBreak,
  Variable,

  // Special segments and values
  Meta,
  ListItem,
  TaskItem,
  FileBlock,
  Row,
  Cell,
  Column,
  ColumnAlign,
  PathResourceLocator,
  QueryParam,

  // Attributes, comments, diagnostics
  Attribute,
  JsonValue,
  LineReflection,
  SegmentReflection,
  Loc,
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
| `.diagnostics`    | `Diagnostic[]` | Warnings (CDN codes)                                              |
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

The shapes follow the spec's AST reference (Appendix A). Every segment names its kind in `_type`; property names that begin with `_` are reserved for structure. The AST has no `null` except `Page.meta` and a path locator that holds no valid path.

#### Document structure

| Type       | Key fields                                                                    |
| ---------- | ----------------------------------------------------------------------------- |
| `Document` | `children: Page[]`                                                            |
| `Page`     | `meta: Meta \| null`, `reflections: SegmentReflection[]`, `children: Block[]` |

#### Block nodes

| Type            | Key fields                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Section`       | `level: 1..9`, `heading: Inline[]`, `children: Block[]`, `attributes`, `reflections`                              |
| `Paragraph`     | `children: Inline[]`, `attributes`, `reflections`                                                                 |
| `CodeBlock`     | `language: string`, `raw: string`, `caption: Inline[]`, `attributes`, `reflections`                               |
| `MathBlock`     | `raw: string`, `caption: Inline[]`, `attributes`, `reflections`                                                   |
| `QuoteBlock`    | `children: Inline[] \| Block[]`, `caption: Inline[]`, `attributes`, `reflections`                                 |
| `List`          | `kind: 'bullet' \| 'numbered' \| 'checklist'`, `start: number`, `loose: boolean`, `children`, `attributes`        |
| `Table`         | `rows: Row[]`, `columns: Column[]`, `caption: Inline[]`, `attributes`                                             |
| `FileGroup`     | `children: FileBlock[]`, `attributes`                                                                             |
| `EmbedBlock`    | `url: string`, `caption: Inline[]`, `attributes`, `reflections`                                                   |
| `InjectBlock`   | `raw: string`, `src: PathResourceLocator \| null`, `children: Block[]` (always `[]`), `attributes`, `reflections` |
| `NamedBlock`    | `name: string`, `children: Inline[] \| Block[]`, `caption: Inline[]`, `attributes`, `reflections`                 |
| `SpoilerBlock`  | `children: Inline[] \| Block[]`, `caption: Inline[]`, `attributes`, `reflections`                                 |
| `RefDefinition` | `ref: string`, `children: Inline[]`, `attributes`, `reflections`                                                  |

#### Special segments

| Type        | Key fields                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `Meta`      | `format: 'yaml' \| 'toml' \| 'json'`, `raw: string` — fills `Page.meta`, never in `children`        |
| `ListItem`  | `children: Inline[] \| Block[]`, `attributes`, `reflections`                                        |
| `TaskItem`  | `checked: boolean`, `children: Inline[] \| Block[]`, `attributes`, `reflections`                    |
| `FileBlock` | `raw: string`, `src: PathResourceLocator \| null`, `caption: Inline[]`, `attributes`, `reflections` |
| `Row`       | `_type: 'Row' \| 'Header'`, `children: Cell[]`, `attributes`, `reflections`                         |
| `Cell`      | `children: Inline[]`, `row: number`, `column: number`                                               |
| `Column`    | `align: 'start' \| 'left' \| 'right' \| 'center' \| 'comma' \| 'decimal'`                           |

A container whose body is exactly one paragraph holds that paragraph's `Inline[]`; any other body is `Block[]`. The two never mix.

#### Inline nodes

| Type               | Key fields                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Text`             | `value: string`                                                                                                                            |
| `Emphasis`         | `children: Inline[]`, `attributes`                                                                                                         |
| `Strong`           | `children: Inline[]`, `attributes`                                                                                                         |
| `Highlight`        | `children: Inline[]`, `attributes`                                                                                                         |
| `Spoiler`          | `children: Inline[]`, `attributes`                                                                                                         |
| `Link`             | `kind: LinkKind`, `children: Inline[]`, `href: string`, `raw: string`, `path: PathResourceLocator \| null`, `target: string`, `attributes` |
| `CodeInline`       | `value: string`, `attributes`                                                                                                              |
| `MathInline`       | `formula: string`, `attributes`                                                                                                            |
| `QuoteInline`      | `kind: 'double' \| 'single'`, `children: Inline[]`, `attributes`                                                                           |
| `ImageInline`      | `alt: Inline[]`, `raw: string`, `src: PathResourceLocator \| null`, `attributes`                                                           |
| `EmbedImageInline` | `alt: Inline[]`, `url: string`, `attributes`                                                                                               |
| `Mark`             | `name: string`, `children: Inline[]`, `attributes`                                                                                         |
| `LineBreak`        | _(no fields)_                                                                                                                              |
| `Variable`         | `key: string`, `attributes`                                                                                                                |

```ts
type LinkKind = 'external' | 'page' | 'id' | 'ref' | 'tag' | 'cite'

interface PathResourceLocator {
  path: string // normalized, from the project root
  query: { key: string; value: string }[]
  fragment: string
}
```

---

### Attributes

Every node that carries `attributes: Attribute[]` uses this shape:

```ts
type Attribute =
  | { key: 'id'; value: string } // {#my-id}
  | { key: 'class'; value: string[] } // {.foo .bar class="baz"}
  | { key: string; value: string | JsonObject | JsonArray } // {key=value}, bare {flag}, {data={"a":1}}
```

---

### Comments

Comments produce no node. A `##` comment on a line that belongs to a block is a `LineReflection` (`{ loc, text }`) in that node's `reflections`. A `###` CommentBlock and a `##` line standing between blocks are `SegmentReflection`s (`{ loc, text, before }`) in `Page.reflections`, where `before` is the child-index path of the block the comment stands before.

---

### Diagnostics

```ts
interface Diagnostic {
  code: string // CDN-XXXX code from the spec
  level: 'warning' | 'info'
  loc?: Loc
  message: string
}
```

Diagnostics are collected during parsing and never thrown. Every input is a valid document: the parser always produces an AST, and a diagnostic only records where it recovered from input the author probably did not mean. There is no `error` level; a tool may still treat any warning as a failure of its own.

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

Flat registry of all 34 visitable segment types, keyed by their `_type` discriminant. Used as the base type parameter throughout the pipeline system. Rarely needed directly — it is the default `TMap` on `ASTResult<NodeMap>` and the constraint for `Visitors` and `PluginDelta`.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to the parser, including version policies tied to the specification.

## License

License: [MIT](LICENSE)
