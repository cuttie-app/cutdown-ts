---
title: Cutdown Diagnostic Code Registry
Status: Active
Owner: Language
Scope: Canonical list of all stable diagnostic codes emitted by conforming Cutdown parsers
Related:
  - `./diagnostics-policy.md`
  - `./diagnostic-code-registry-policy.md`
  - `./versioning-policy.md`
---

## Cutdown Diagnostic Code Registry

All codes use the prefix `CDN-`. Codes are permanently assigned — retired codes are marked `removed` but never reused.

---

### CDN-0001 — Unclosed CodeBlock fence

| Field         | Value                                                                             |
| ------------- | --------------------------------------------------------------------------------- |
| code          | CDN-0001                                                                          |
| title         | Unclosed CodeBlock fence                                                          |
| level         | warning                                                                           |
| trigger       | A ` ``` ` opening fence has no matching closing ` ``` ` before end of document    |
| recovery      | Content from the opening fence to end of document is treated as CodeBlock content |
| introduced_in | 0.1.4                                                                             |
| status        | active                                                                            |
| owner         | Language                                                                          |

---

### CDN-0002 — Unclosed MetaBlock fence

| Field         | Value                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| code          | CDN-0002                                                                         |
| title         | Unclosed MetaBlock fence                                                         |
| level         | warning                                                                          |
| trigger       | A `~~~` opening fence has no matching closing `~~~` before end of document       |
| recovery      | Content from the opening fence to end of document is treated as Meta raw content |
| introduced_in | 0.1.4                                                                            |
| status        | active                                                                           |
| owner         | Language                                                                         |

---

### CDN-0003 — Unclosed MathBlock fence

| Field         | Value                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------- |
| code          | CDN-0003                                                                                  |
| title         | Unclosed MathBlock fence                                                                  |
| level         | warning                                                                                   |
| trigger       | A `$$$` opening fence has no matching closing `$$$` before end of document                |
| recovery      | Content from the opening fence to end of document is treated as MathBlock formula content |
| introduced_in | 0.1.4                                                                                     |
| status        | active                                                                                    |
| owner         | Language                                                                                  |

---

### CDN-0004 — Unclosed NamedBlock

| Field         | Value                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| code          | CDN-0004                                                                           |
| title         | Unclosed NamedBlock                                                                |
| level         | warning                                                                            |
| trigger       | A `:::name` opening line has no matching closing `:::` before end of document      |
| recovery      | Content from the opening line to end of document is treated as NamedBlock children |
| introduced_in | 0.1.4                                                                              |
| status        | active                                                                             |
| owner         | Language                                                                           |

---

### CDN-0010 — ThematicBreak text content dropped

| Field         | Value                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| code          | CDN-0010                                                                                                     |
| title         | ThematicBreak text content dropped                                                                           |
| level         | warning                                                                                                      |
| trigger       | A ThematicBreak line (`---`) contains non-whitespace, non-attribute text (e.g., `--- some text {.x}`)        |
| recovery      | Text between the dashes and optional `{attrs}` is silently discarded; ThematicBreak node is emitted normally |
| introduced_in | 0.1.4                                                                                                        |
| status        | active                                                                                                       |
| owner         | Language                                                                                                     |

---

### CDN-0011 — Orphaned scope-chain attributes

| Field         | Value                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| code          | CDN-0011                                                                                                                                |
| title         | Orphaned scope-chain attributes                                                                                                         |
| level         | warning                                                                                                                                 |
| trigger       | One or more `{...}` blocks at the front of a trailing attribute chain have no slot to claim (chain has fewer slots than `{...}` blocks) |
| recovery      | Excess `{...}` blocks at the front of the chain are discarded; no AST output for them                                                   |
| introduced_in | 0.1.4                                                                                                                                   |
| status        | active                                                                                                                                  |
| owner         | Language                                                                                                                                |

---

### CDN-0012 — Heading level out of range

| Field         | Value                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------- |
| code          | CDN-0012                                                                                      |
| title         | Heading level out of range                                                                    |
| level         | warning                                                                                       |
| trigger       | A line begins with 10 or more `=` characters followed by a space (would be heading level > 9) |
| recovery      | The entire line is emitted as literal `Text`; no Section node is created                      |
| introduced_in | 0.1.4                                                                                         |
| status        | active                                                                                        |
| owner         | Language                                                                                      |

---

### CDN-0020 — Duplicate id attribute

| Field         | Value                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| code          | CDN-0020                                                                                                  |
| title         | Duplicate id attribute                                                                                    |
| level         | warning                                                                                                   |
| trigger       | A second `#id` or `id=` token appears in a `{...}` block after the first `id` claim has already been made |
| recovery      | The duplicate token is dropped; the first `#id` or `id=` value is kept                                    |
| introduced_in | 0.2.0                                                                                                     |
| status        | active                                                                                                    |
| owner         | Language                                                                                                  |

---

### CDN-0021 — `class=` conflicts with `.class` syntax

| Field         | Value                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------- |
| code          | CDN-0021                                                                                     |
| title         | class= conflicts with .class syntax                                                          |
| level         | warning                                                                                      |
| trigger       | A `class=` token appears alongside one or more `.classname` tokens in the same `{...}` block |
| recovery      | The `class=` token is dropped; all `.classname` tokens are collected into the `class` entry  |
| introduced_in | 0.2.0                                                                                        |
| status        | active                                                                                       |
| owner         | Language                                                                                     |

---

### CDN-0022 — Duplicate custom attribute key

| Field         | Value                                                                          |
| ------------- | ------------------------------------------------------------------------------ |
| code          | CDN-0022                                                                       |
| title         | Duplicate custom attribute key                                                 |
| level         | warning                                                                        |
| trigger       | A `key=value` token appears more than once for the same key in a `{...}` block |
| recovery      | All occurrences after the first are dropped; the first value is kept           |
| introduced_in | 0.2.0                                                                          |
| status        | active                                                                         |
| owner         | Language                                                                       |

---

### CDN-0013 — Nameless NamedBlock opener

| Field         | Value                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| code          | CDN-0013                                                                                                                             |
| title         | Nameless NamedBlock opener                                                                                                           |
| level         | warning                                                                                                                              |
| trigger       | A line starts with `:::` but is not followed by an `[ID_LITERAL]` character (e.g. `::: {.alert}`, `:::` alone on a non-closing line) |
| recovery      | The block candidate is parsed as a Paragraph. All content including `:::` and any trailing `{attrs}` is emitted as literal text.     |
| introduced_in | 0.1.5                                                                                                                                |
| status        | active                                                                                                                               |
| owner         | Language                                                                                                                             |

---

### CDN-0014 — Crossed inline element boundaries

| Field         | Value                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| code          | CDN-0014                                                                                                                                                                                                                                                                                                                             |
| title         | Crossed inline element boundaries                                                                                                                                                                                                                                                                                                    |
| level         | warning                                                                                                                                                                                                                                                                                                                              |
| trigger       | An inline element A closes via its delimiter while an opener of a **different** inline type B (one of `**`, `__`, `~~`, `""`, `''`, `[`) was present inside A's content and emitted as literal text — and a closer for B exists in the inline stream after A's boundary. Span points to A's closing delimiter (the crossing closer). |
| recovery      | Existing greedy left-to-right behavior applies unchanged. No AST change. The diagnostic is informational only.                                                                                                                                                                                                                       |
| introduced_in | 0.3.2                                                                                                                                                                                                                                                                                                                                |
| status        | active                                                                                                                                                                                                                                                                                                                               |
| owner         | Language                                                                                                                                                                                                                                                                                                                             |

---

### CDN-0030 — Meta block inside block container

| Field         | Value                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| code          | CDN-0030                                                                                                                                                                                 |
| title         | Meta block inside block container                                                                                                                                                        |
| level         | warning                                                                                                                                                                                  |
| trigger       | A `~~~` fence opener is encountered inside a block container (`ListItem`, `TaskItem`, `QuoteBlock`, or `NamedBlock`)                                                                     |
| recovery      | The entire raw span — including the opening `~~~` line, all content lines, and the closing `~~~` line — is emitted as a single `Paragraph` with literal text. No `Meta` node is created. |
| introduced_in | 0.2.1                                                                                                                                                                                    |
| status        | active                                                                                                                                                                                   |
| owner         | Language                                                                                                                                                                                 |
