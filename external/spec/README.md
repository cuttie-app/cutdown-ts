# Cutdown

You write structure. You write content.

_Cutdown_ derives from Markdown. The name is literal: _cut_ from the wide variety _of Markdown_ syntax features down to what content actually needs. It produces a structured document tree — headings, paragraphs, lists, blocks — that an application interprets and renders. There is no canonical visual output. No rendering opinions baked in. Some things work the same as Markdown. Some were changed deliberately. Each change has a reason.

---

## Quick example

```
= Hello **world**
```

```json
{
  "type": "Section",
  "level": 1,
  "heading": [
    { "type": "Text", "value": "Hello " },
    { "type": "Emphasis", "children": [{ "type": "Text", "value": "world" }] }
  ]
}
```

---

## Why Cutdown

**Plain text separated by a blank line is a paragraph.**

That single rule is what made Markdown worth learning. No extra syntax. No delimiters. No toolbar. Two blocks of text separated by a double Enter are structurally paragraphs — you think, you write, you press Enter twice. This is a brilliant invention, and Cutdown preserves it carefully and completely. It is the foundation everything else is built on.

**`#` for author comments.**

Finally, markup has a legal way to place a comment — a part of the source that is stripped from rendering. It is not something you reach for in every document. But when you need it, you discover how useful it is: annotations, draft notes, TODO markers, editorial reminders that belong to the source and nowhere else.

The syntax is aligned with YAML — the format used for frontmatter on the same page — and with C++, PHP, Perl, and most other programming languages. Comment-with-`#` is common practice everywhere except Markdown. That gap is now closed.

**`=` instead of `#` for headings.**

With `#` doing something useful elsewhere, a different heading marker was needed. `=` was chosen — and it was a considered choice.

Why does a non-US keyboard matter here? Heading markers appear in the overwhelming majority of documents. If a writer on a French, German, Italian, or UK English keyboard cannot reach the heading character as a single keypress, that is a friction point in every document they write. The octothorpe ended up as a heading marker by accident — it was picked, it stuck, and use became tradition. That accident is worth correcting.

AsciiDoc, Typst uses the same convention: `= Document Title`, `== Section`. It is not without precedent. `=` is unambiguous, carries no meaning in prose or code, and is reachable from every keyboard. The count encodes the depth: `=` is level one, `==` is level two. Consistent everywhere.

**Doubled delimiters only. Single characters are text.**

Cutdown uses doubled or tripled characters for all inline spans: `**bold**`, ` ``code`` `, `~~strikethrough~~`, `$$math$$`. Single characters are always literal text — no exceptions, no flanking rules.

Consider ordinary prose: `$50,000`, `they gathered ~100,000 people`, `your salary = hours * rate`. In a language where a single `$`, `~`, or `=` could open a span, these require escaping or careful placement. In Cutdown, they do not. A doubled delimiter opens a span. A single one is text. The rule is the same everywhere, with no context sensitivity and nothing to escape in normal writing.

**What you type is what is stored.**

Cutdown performs no typographic substitution. Straight quotes `"` stay straight. `--` stays `--`. `...` stays `...`. Nothing is silently transformed. If your output needs typographic quotes, that transformation happens in the renderer — configured by locale, applied consistently. In source, your text is exactly what you typed.

This matters in practice. A content pipeline handling technical documentation, pricing, or any mix of prose and code needs predictable literal characters. Silent substitution is a class of bugs that appears only at render time, varies by parser, and is hard to trace back to source.

**Angle brackets are ordinary text.**

`<em>` in a Cutdown document is literal text — not a tag, not an escape hatch. Angle brackets carry no special meaning. This is a deliberate break from Markdown, where raw HTML passes through to output by default. That passthrough is a known XSS vector: any pipeline accepting user-written Markdown and rendering it to HTML must add a separate sanitizer. Every tool handles this differently, producing inconsistent behavior and a security surface that belongs to the language, not the application.

In Cutdown there is nothing to sanitize. The injection surface does not exist.

**A newline inside a paragraph is nothing.**

In HTML, a bare newline in source is collapsed to a space — `word\nword` renders as `word word`. Markdown inherits this: a single line break inside a paragraph is folded to a space. The reasoning is that authors wrap long lines at 80 characters for readability, so the parser quietly joins those lines with a space.

Cutdown folds the newline to zero instead. `word\nword` produces `wordword` — the lines concatenate directly, no character inserted.

Why this matters: in CJK writing (Chinese, Japanese, Korean), characters carry their own spacing. A line break between two CJK characters that adds an ASCII space corrupts the text — `こんにちは\n世界` should render as `こんにちは世界`, not `こんにちは 世界`. With HTML/Markdown's NL→space rule, CJK authors must write their entire paragraph on a single line or use special tooling to strip injected spaces. The rule was designed for Western prose and silently breaks East Asian text.

With NL→zero, CJK prose wraps freely at any character. Western prose retains word boundaries because words end with a space before the line break — `word \nword` preserves the trailing space as a `Text(" ")` node, giving `word word`. The author controls the boundary explicitly. Consumer editors can help by inserting a trailing space automatically when Enter is pressed.

The rule is uniform: it applies inside inline spans (Emphasis, Strong, etc.) as well as plain paragraph text. Leading spaces on continuation lines are stripped before inline parsing to prevent mid-word space artifacts.

**Frontmatter belongs where you put it.**

In most Markdown-based tools, frontmatter is fixed at the top of the file — the first line must be the opening fence, before any comment, license notice, or authored content. In Cutdown, a Meta block can appear anywhere on a document. Multiple Meta blocks are valid on the same document.

This is not a feature designed for everyday use. It follows naturally from the language design, and it brings its own benefits: placing a comment or license notice before frontmatter is a legal and ordinary thing to do. See the [spec](spec/TOC.md) for details.

---

If your team is already familiar with Markdown and evaluating whether Cutdown fits an existing content workflow, the changes above address specific, documented problems in Markdown-based pipelines: parser inconsistency across implementations, HTML injection surface, typographic substitution producing unexpected characters in technical content, and the absence of structured output for programmatic processing. Cutdown's formal grammar and 87-test conformance corpus mean a compliant parser produces identical output regardless of implementation language. AST output means your application controls rendering completely — no HTML string manipulation, no post-processing sanitizers.

What Cutdown cannot yet promise: no parser implementation exists, and the spec is pre-1.0. If your workflow needs a production-ready tool today, the honest answer is that Cutdown is not there yet. If you are building a new content pipeline and want to start on a better foundation, the spec, grammar, and conformance corpus are complete enough to build from.

---

## What Cutdown doesn't do

**No kitchen sink.**

Cutdown has headings, paragraphs, lists, tables, quotes, code, links, images, and named blocks. Nothing else. Every construct earned its place because content needs it, not because it was possible to add. A smaller syntax is a more learnable syntax, a more implementable parser, and a more consistent authoring experience across tools. Extensions exist for application-specific constructs. The core is deliberately narrow.

---

## Syntax

[Quick reference → `SYNTAX.md`](SYNTAX.md) · [Full spec → `spec/TOC.md`](spec/TOC.md)

```
= Hello **world**

Some paragraph with ~~struck~~ text and a [link](https://example.com).

:::callout {.warning}
  Watch out.
:::
```

---

## Repository layout

| Path                         | Contents                                             |
| ---------------------------- | ---------------------------------------------------- |
| [`spec/`](spec/)             | Language specification §1–§16                        |
| [`tests/`](tests/)           | Conformance corpus — golden YAML tests               |
| [`extensions/`](extensions/) | Extension specs (task-item, mention)                 |
| [`policies/`](policies/)     | Governance and conformance policies                  |
| [`SYNTAX.md`](SYNTAX.md)     | Condensed syntax reference for tooling and AI agents |

---

## Spec status

**Version:** 0.3.3 · **Status:** Draft

The spec is under active development. Breaking changes may occur before 1.0.0.

---

## Implementations

No parser implementations exist yet.

The spec ([`spec/`](spec/)) and conformance corpus ([`tests/`](tests/)) are the starting point for building one. The corpus provides golden YAML tests covering all spec sections and all diagnostic codes.

## Tooling

No official tooling yet. If you build something — an editor plugin, linter, or renderer — open a PR to list it here.

---

## File extension

`.cutdown` is the recommended extension for Cutdown documents.

## MIME type

There is no official MIME type. `text/x-cutdown` may be used informally.

---

## For implementors

| Resource                 | Description                                    |
| ------------------------ | ---------------------------------------------- |
| [`spec/`](spec/)         | Language specification §1–§16                  |
| [`tests/`](tests/)       | Conformance tests (golden YAML, all CDN codes) |
| [`SYNTAX.md`](SYNTAX.md) | Condensed syntax reference                     |

---

## For Contributors

[See `CONTRIBUTION.md`](CONTRIBUTION.md)

---

## Acknowledgements

_Inspired by [CommonMark](https://commonmark.org) and [Djot](https://djot.net)._

---

## License

[CC BY 4.0](LICENSE) — Anton Huz, Cuttie App
