## 12. Whitespace Rules

| Situation                                     | Rule                                                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Line endings                                  | Normalized to `\n` before parsing                                                                                                                                             |
| Encoding                                      | UTF-8 required                                                                                                                                                                |
| Trailing spaces                               | Ignored, **except**: a single trailing space immediately before a soft break is preserved — it becomes `Text(" ")` in the AST, serving as an explicit word-boundary separator |
| Leading spaces on block line                  | Stripped before block classification                                                                                                                                          |
| Leading spaces on paragraph continuation line | Stripped before inline parsing                                                                                                                                                |
| Multiple blank lines                          | Treated as a single blank line                                                                                                                                                |
| Tabs outside fenced blocks                    | Normalized to a single space before block classification                                                                                                                      |
| Tabs inside code/metadata/math fences         | Preserved literally                                                                                                                                                           |
| Blank lines inside code fence                 | Preserved literally in `content` string                                                                                                                                       |
| Blank lines inside metadata fence             | Passed through in `raw` string                                                                                                                                                |
| Soft break (single newline in paragraph)      | Folded to zero — no character emitted, no AST node; lines concatenate directly                                                                                                |
| Hard break (`\` at line end)                  | Produces `TextBreak` node                                                                                                                                                     |

### 12.2 Inline Block Whitespace

Within any inline block (Emphasis, Strong, Strikethrough, MathInline, QuoteInline):

| Situation                                                               | Rule                              |
| ----------------------------------------------------------------------- | --------------------------------- |
| Whitespace between two adjacent opening delimiters (nesting context)    | Collapsed to zero                 |
| Whitespace between opening delimiter and first literal                  | Stripped to zero                  |
| Whitespace between last literal and closing delimiter                   | Stripped to zero                  |
| Whitespace between closing delimiter and next sibling opening delimiter | Preserved as `Text(" ")`          |
| Interior whitespace runs                                                | Collapsed to one space            |
| Non-breaking space (`\u00A0`)                                           | Always preserved, never collapsed |

`CodeInline` is **exempt from whitespace collapsing** — boundary stripping and interior run collapsing do not apply. The paragraph-level soft-break rule (single `\n` → zero) also applies: a `CodeInline` spanning two lines of a paragraph has the newline removed with no replacement in `value`. For multi-line code, use `CodeBlock` (§9.4).

**Examples:**

```
** bb **           → Emphasis([Text("bb")])
**  text  **       → Emphasis([Text("text")])
**  **             → Emphasis([])
aa**bb**cc         → Text("aa") + Emphasis([Text("bb")]) + Text("cc")
__ ** bb **__      → Strong([Emphasis([Text("bb")])])   (space between __ and ** = zero)
__ bb __ ** cc **  → Strong([Text("bb")]) + Text(" ") + Emphasis([Text("cc")])
```

---
