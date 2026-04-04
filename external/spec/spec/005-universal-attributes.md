## 5. Universal Attributes

### 5.1 Syntax

```
{#id .class key=value key="value with spaces"}
```

Token types inside `{}`:

- `#identifier` — sets the `id` attribute. Emits `{ key: "id", value: "identifier" }`. First `#` wins; any subsequent `#id` or `id=` token is dropped and CDN-0020 is emitted.
- `.classname` — appends to the `class` entry. All `.classname` tokens in a block are collected into a single `{ key: "class", value: string[] }` entry. `.class` syntax has priority: if `class=` also appears, `class=` is dropped and CDN-0021 is emitted.
- `key=value` — custom attribute. Emits `{ key: "key", value: "value" }`. Unquoted value: no spaces. Quoted value: spaces allowed. First occurrence wins; duplicate keys are dropped and CDN-0022 is emitted.
- `key` (bare, no `=`) — flag token. Emits `{ key: "key", value: "" }`. Signals a semantic hint with no associated value.
- Token order inside `{}` is preserved in the emitted `Attribute[]`.

> **Philosophy:** Universal Attributes are semantic hints for consumers — they are not one-to-one mappings to HTML attributes. A bare `{banner}` does not mean `<div banner>`; it means "this element has the semantic role 'banner'." The consuming application decides how to expand, map, or ignore any attribute token. Cutdown makes no assumption about the rendering target.

### 5.2 Placement

Attributes MUST appear **after** their target element on the **same line**.

```
== Section {#intro}
**bold text** {.highlight}
:::callout {.warning}
```

#### Block Opening Lines — Last-Attr Rule

On lines that open a block construct (headings, named blocks), the **last `{...}` token on the line is claimed by the block**. All earlier `{...}` tokens on the same line follow inline attachment rules and bind to their immediately preceding inline element.

An empty `{}` as the last token explicitly assigns no attributes to the block, freeing earlier `{...}` to bind inward.

```
= Heading **bold**{.b} {#h}    →  Section({id:"h"}, [Text("Heading "), Strong({class:"b"}, "bold")])
= Heading **bold**{.b} {}      →  Section({},        [Text("Heading "), Strong({class:"b"}, "bold")])
= Heading **bold** {#h}        →  Section({id:"h"},  [Text("Heading "), Strong("bold")])
```

This rule applies only in block opening line context. In paragraph context all `{...}` follow inline attachment rules exclusively.

#### Per-node placement rules

- `Meta`: no attributes supported.
- `RefDefinition`: has `attributes`.
- `Table`: see §9.8.3 for row and table attr placement.
- `List / FileRefGroup / ImageGroup / QuoteBlock / Paragraph`: scope-chain rule (Rule B) — see below.
- `Cell`, `Column`, `Page`, `Document`: no attributes supported.

#### Scope-chain rule (Rule B)

A sequence of `{attr}` blocks at the end of an inline context is distributed **right-to-left** through a scope chain. The **last** `{}` in the sequence is claimed by the **highest segment** in the current hierarchy; each preceding `{}` claims the next lower segment. Any `{}` blocks at the front of the sequence that have no segment to claim are **silently dropped**.

An empty `{}` is valid syntax. It claims its slot and assigns nothing to that node's attributes.

`{...}` is tokenized **atomically** — the interior is never parsed as inline markup. If the `{` has no matching `}` before end of inline context, `{` is emitted as `Text("{")` and parsing continues normally.

**Scope slots by context:**

| Context                       | Slot 1 (last `{}`)   | Slot 2                   | Slot 3                   |
| ----------------------------- | -------------------- | ------------------------ | ------------------------ |
| Standalone Paragraph          | Paragraph            | last attr-bearing inline | —                        |
| List item                     | List                 | ListItem                 | last attr-bearing inline |
| Table row — mid-table         | Row                  | —                        | —                        |
| Table row — last row          | Table                | Row                      | —                        |
| FileRef / ImageBlock in group | FileRefGroup         | FileRef / ImageBlock     | last attr-bearing inline |
| QuoteBlock nesting (`> >`)    | outermost QuoteBlock | … inner levels …         | Paragraph → inline       |

Single NL does not break the attr chain. A sequence of `{}` blocks may span multiple lines (one per line) as long as no blank line appears between them.

```
- ::sp {.a}{.b}{.c}  →  List({.c}, ListItem({.b}, Span({.a})))
- ::sp {.a}{.b}      →  List({.b}, ListItem({.a}, Span()))
- ::sp {.a}          →  List({.a}, ListItem(Span()))
- ::sp {}            →  List({},   ListItem(Span()))     ← {} no-op on List
- ::sp {.a}{}        →  List({},   ListItem({.a}, Span())) ← {} no-op on List; {.a} to ListItem
- text {.a}{.b}      →  List({.b}, ListItem({.a}, Text("text")))
- text {.a}          →  List({.a}, ListItem(Text("text")))
- text {.a}{.b}{.c}  →  List({.c}, ListItem({.b}, Text("text")))   ← {.a} dropped (Text has no attrs)
```

Same rule applies to `FileRefGroup` and `ImageGroup`:

```
/img.png {.a}{.b}   →  FileRefGroup({.b}, FileRef({.a}, ...))
/img.png {.a}       →  FileRefGroup({.a}, FileRef(...))
/img.png {}         →  FileRefGroup({},   FileRef(...))    ← {} no-op on group
/img.png {.a}{}     →  FileRefGroup({},   FileRef({.a}, ...))
```

Multiline equivalents (all produce identical AST):

```
- li item {.a}{.b}

- li item
  {.a}{.b}

- li item
  {.a}
  {.b}
```

#### Trailing attr lines and loose-list detection

A line consisting solely of `{attrs}` immediately after a list item with no preceding blank line is a **trailing attr line**, not a blank line. Loose list detection ignores trailing attr lines.

```
- item one
{.attrs}         ← trailing attr line, NOT a blank line → list stays tight
- item two

- item one

{.attrs}         ← blank line precedes → list is loose; {.attrs} is orphaned (literal)
- item two
```

`{attrs}` may appear at the end of a Paragraph or ListItem either on the same line as the final content line, or on the immediately following line (no blank line between). A line consisting solely of `{attrs}` immediately after a paragraph (no blank line) is consumed as part of the paragraph's scope chain and does not start a new block.

### 5.3 Orphan Attributes

An `{...}` sequence that cannot be assigned to any segment in the current scope chain is an **orphan**.

Orphan behaviour depends on position:

| Position                                                                      | Behaviour                        | Example                                                    |
| ----------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| Middle of inline content (no preceding attr-bearing segment, slots exhausted) | `Text("{...}")` emitted verbatim | `price is {high}` → `Text("price is ")` + `Text("{high}")` |
| After a double blank line (own block, no following content claims it)         | `Text("{...}")` emitted verbatim |                                                            |
| End of scope chain, all slots filled, excess `{}` at the front                | silently dropped (no AST output) | `{.x}{.a}{.b}` on a 2-slot context → `{.x}` dropped        |

`{` is always consumed as the start of a potential attribute block. If no matching `}` is found before end of inline context, `{` is emitted as `Text("{")` and parsing resumes from the character after `{`.

Authors who want a literal `{` SHOULD escape it with `\{` to make intent explicit. The parser handles unescaped `{` via fallback (emits `Text("{")` if no matching `}` is found), but relying on fallback is fragile:

```
price is \{high\}  →  Text("price is {high}")
```

### 5.4 Attribute Inside Link Text

`{attrs}` appearing inside `[...]` follows paragraph rules: it attaches to the preceding inline element, or is dropped if no preceding inline element exists.

```
[**bold** {.foo}](url)  →  Link { children: [Emphasis({class:"foo"}, "bold")], href: "url" }
[{.foo} text](url)      →  Link { children: [Text("text")], href: "url" }   ({.foo} dropped)
```

---
