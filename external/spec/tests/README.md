# Cutdown conformance corpus

This directory contains the golden test fixtures for the Cutdown language spec. A compliant parser must pass all of them.

## Structure

Fixtures are organized by spec section. Each subdirectory maps to one section:

```
tests/
  004-escaping/
  005-universal-attributes/
  007-document-model/
  008-block-structure/
  009-block-elements/
  010-inline-elements/
  diagnostics/          ← one fixture per CDN-xxxx diagnostic code
```

A test runner must walk all `*.yaml` files recursively — loading only the top level will silently pass zero tests.

## Fixture format

Each `.yaml` file is a single fixture:

```yaml
id: emphasis-basic
section: '10.2'
description: '** delimiters produce Emphasis; single * is literal text'

input: '**bold**'

ast:
  - type: Paragraph
    children:
      - type: Emphasis
        children:
          - type: Text
            value: bold
```

### Fields

| Field         | Required | Description                                                                                                      |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`          | yes      | Unique fixture ID (kebab-case, matches filename without `.yaml`)                                                 |
| `section`     | yes      | Spec section number as a string (e.g. `"9.4"`)                                                                   |
| `description` | yes      | One-line human-readable description                                                                              |
| `input`       | yes      | Raw Cutdown source text                                                                                          |
| `ast`         | —        | Expected children of the first page (see [Assertions](#assertions))                                              |
| `pages`       | —        | Expected full `Document.children` array; use when the fixture spans multiple pages. Overrides `ast` when present |
| `diagnostics` | —        | Expected diagnostics (see [Assertions](#assertions)); if omitted, the parser must emit zero diagnostics          |

Exactly ONE OF `ast` or `pages` MUST be present.

### Assertions

**AST matching** uses a **deep subset match**:

- All keys present in the expected object MUST exist in the actual output with identical values.
- Extra keys in the actual output MAY exist and are ignored (implementations may add position info, etc.).
- Arrays MUST be the **same length**; each element is subset-matched recursively.
- Primitives MUST be compared by value (`===`).

This means a minimal fixture only needs to assert the fields it cares about — it will not break if the parser adds new optional fields later.

**Diagnostics matching** is order-independent:

- Every `{ code, level }` entry listed under `diagnostics` MUST appear in the actual output.
- No diagnostic MAY appear in the actual output that is not listed in the fixture.
- If `diagnostics` is omitted entirely, the parser MUST produce zero diagnostics.

### `ast` vs `pages`

`ast` matches the `children` array of the first page — the common case for single-page documents:

```yaml
ast:
  - type: Paragraph
    children:
      - type: Text
        value: Hello
```

`pages` matches the full `Document.children` array and is used when the fixture tests page-splitting (ThematicBreak, duplicate Meta block):

```yaml
pages:
  - children:
      - type: Paragraph
        children:
          - type: Text
            value: First
  - children:
      - type: ThematicBreak
```

## Attribute fixtures

Attributes are asserted as an ordered array of `{ key, value }` objects. The `class` shorthand (`.class`) produces `value: string[]` (array of strings); all other values are plain strings:

```yaml
ast:
  - type: List
    attributes:
      - key: class
        value: [list-class]
    children:
      - type: ListItem
        attributes:
          - key: class
            value: [item-class]
```

## Diagnostic fixtures

Fixtures in `diagnostics/` test warning behaviour. The fixture asserts both the AST produced (recovery output) and the diagnostic code emitted:

````yaml
id: cdn-0001-unclosed-codeblock
section: '9.4'
description: 'Unclosed ``` fence; content runs to end of document; CDN-0001 warning emitted'

input: "```python\nx = 1\n"

ast:
  - type: CodeBlock
    language: python
    content: x = 1

diagnostics:
  - code: CDN-0001
    level: warning
````

## ID and filename conventions

- ID is kebab-case: `code-block-basic`, `cdn-0001-unclosed-codeblock`
- Filename matches ID exactly: `code-block-basic.yaml`
- Diagnostic fixtures are prefixed with the code: `cdn-0001-*.yaml`
- Variant fixtures suffix the base name: `emphasis-basic`, `emphasis-triple`, `emphasis-unclosed`

## Contributing a test

1. Identify the spec section the fixture covers.
2. Create `tests/<section-dir>/<id>.yaml`. Use an existing fixture in that directory as a template.
3. Fill all required fields. Keep `input` minimal — test one behaviour per fixture.
4. Verify the `id` is unique across the entire corpus (no two fixtures share an `id`).
5. Open a PR. See [`CONTRIBUTION.md`](../CONTRIBUTION.md) for process.
