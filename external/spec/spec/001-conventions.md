## 1. Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **MAY** are used as defined in [RFC 2119].

**Examples** are shown as:

```
Input:
  <cutdown source>

AST:
  <node representation>
```

A `→` symbol means "produces AST node."

### Identifier Character Set

Throughout this spec, `ID_LITERAL` refers to the following ASCII character class:

```
ID_LITERAL = [a-zA-Z0-9._-]
```

This charset is used for all identifier-like tokens: block names, span names, code language tags, reference definition IDs, and variable keys. It is ASCII-only and case-sensitive. Matching against `ID_LITERAL` is always case-sensitive unless explicitly stated otherwise.

`PATH_LITERAL` extends `ID_LITERAL` with the forward-slash character:

```
PATH_LITERAL = [a-zA-Z0-9._/-]
```

`PATH_LITERAL` is used for path-like values: page link targets, tag link targets, and file reference paths.

### Inline Type

Throughout this spec, `Inline` refers to the union of all inline node types:

```
Inline = Text | Emphasis | Strong | Strikethrough | CodeInline | TextBreak
       | Link | ImageInline | Span | MathInline | Variable | QuoteInline
```

Wherever an AST node carries `Inline[]`, the content of that field was produced by the inline parsing rules (§10). All inline contexts are explicitly marked with "parsed by inline rules (§10)".

---
