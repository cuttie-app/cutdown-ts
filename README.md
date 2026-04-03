# @cuttie/cutdown-ts

TypeScript parser for the [Cutdown](https://github.com/cuttie-app/cutdown-spec) markup language. Produces a typed AST with diagnostics. No HTML output — AST only.

## Setup

**Requirements:** Node.js 18+, pnpm (or npm/yarn)

```bash
pnpm install
```

### Conformance test fixtures

The test suite requires the `cutdown-spec` repository cloned as a sibling of this project:

```bash
# From the parent directory of cutdown-ts:
git clone https://github.com/cuttie-app/cutdown-spec
```

Expected layout:

```
experimental/
  cutdown-ts/        ← this repo
  cutdown-spec/      ← spec fixtures (sibling)
    tests/
      *.yaml
```

## Usage

```typescript
import { parse } from '@cuttie/cutdown-ts';

const { ast, diagnostics } = parse('= Hello {#intro}\n\nSome **bold** text.');

// ast.type === 'Document'
// ast.children  →  Page[]
// diagnostics   →  Diagnostic[]  (CDN-xxxx warning codes)
```

### Return types

```typescript
interface ParseResult {
  ast: Document;
  diagnostics: Diagnostic[];
}

interface Document {
  type: 'Document';
  children: Page[];       // one Page per --- break or duplicate meta block
}

interface Page {
  meta: Meta | null;      // ~~~ front-matter block, if any
  children: Block[];
}
```

All exported types are re-exported from the package root — import them directly:

```typescript
import type {
  Document, Page, Block, Section, Paragraph, CodeBlock, List, Table,
  Inline, Text, Emphasis, Strong, Link, Attribute, Diagnostic,
} from '@cuttie/cutdown-ts';
```

## Development

```bash
# Run all conformance tests (requires cutdown-spec sibling)
pnpm test

# Watch mode
pnpm test:watch

# Type-check without emitting
pnpm typecheck

# Build ESM + .d.ts to dist/
pnpm build
```

## Conformance tests

Test fixtures live in `cutdown-spec/tests/**/*.yaml`. Each file covers one spec behaviour:

```yaml
id: emphasis-basic
section: "10.2"
description: "** delimiters produce Emphasis"
input: "**bold**"
ast:
  - type: Paragraph
    children:
      - type: Emphasis
        children:
          - type: Text
            value: bold
```

Fields:

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique fixture ID |
| `section` | yes | Spec section number |
| `description` | yes | Human-readable description |
| `input` | yes | Raw Cutdown text |
| `ast` | — | Expected first-page children (deep subset match) |
| `pages` | — | Expected full `Document.children` array; overrides `ast` |
| `diagnostics` | — | Expected `[{ code, level }]`; if omitted, zero diagnostics are expected |

The test runner does a **deep subset match**: all keys present in the expected object must match, extra keys in the actual output are ignored. Arrays must have the same length.

## Diagnostic codes

| Code | Trigger |
|---|---|
| CDN-0001 | Unclosed ` ``` ` code fence |
| CDN-0002 | Unclosed `~~~` meta fence |
| CDN-0003 | Unclosed `$$$` math fence |
| CDN-0004 | Unclosed `:::name` named block |
| CDN-0010 | Text before `{attrs}` on a thematic break line |
| CDN-0011 | More than two trailing `{…}` groups on a list item or table row |
| CDN-0012 | Heading level > 9 (`==========`) |
| CDN-0013 | `:::` without a valid ID name |
| CDN-0020 | Duplicate `#id` in an attribute block |
| CDN-0021 | `class=` key mixed with `.class` shorthand (`.class` wins) |
| CDN-0022 | Duplicate attribute key |
