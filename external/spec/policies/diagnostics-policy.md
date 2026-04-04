---
title: Cutdown Diagnostics Policy
Status: Active
Owner: Language
Scope: Parser diagnostics contract for deterministic tooling and author-safe recovery
Related:
  - `./conformance-policy.md`
  - `./parser-profile-policy.md`
  - `./diagnostic-code-registry-policy.md`
---

# Cutdown Diagnostics Policy

## Goal

Diagnostics must be machine-readable, stable, and non-blocking for normal authoring workflows.

## Output Contract

A parser returns:

- `ast`
- `diagnostics[]`

Each diagnostic includes:

- `code` (stable identifier, for example `CDN-XXXX`)
- `level` (`error` | `warning` | `info`)
- `message` (human-readable)
- `span` (`start_line`, `start_col`, `end_line`, `end_col`)
- `recovery` (how parsing proceeded)

## Severity Rules

- `error`: malformed or invalid input requiring fallback/recovery, but parser still returns AST.
- `warning`: valid parse with potentially unintended author input.
- `info`: non-problem metadata signals.

The parser must not fail-fast on the first issue. It must continue with deterministic recovery and report all encountered diagnostics for the parse pass.

## Recovery Rules

- Recovery behavior must be deterministic and documented per diagnostic code.
- If a construct is invalid/unclosed, parser follows the spec fallback rule and emits corresponding diagnostics.
- Recovery must preserve as much surrounding valid structure as possible.

## Stability Requirements

- Diagnostic `code` values are part of the language contract.
- Changing meaning of an existing diagnostic code requires at least a `minor` policy review and migration note.
- Removing a diagnostic code requires major-version justification.

Diagnostic code definitions and lifecycle are governed by `./diagnostic-code-registry-policy.md`.

## Conformance Requirements

Conformance tests must assert:

- expected AST output,
- expected diagnostic codes and levels,
- expected recovery mode for malformed cases.

## Silent-Drop Warning Cases

The following spec-defined recovery behaviors MUST emit a `warning`-level diagnostic. See the Diagnostic Code Registry for full trigger/recovery definitions.

| Situation                                               | Code     | Recovery                                                                                |
| ------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| Unclosed CodeBlock fence (` ``` `)                      | CDN-0001 | Content runs to end of document                                                         |
| Unclosed MetaBlock fence (`~~~`)                        | CDN-0002 | Content runs to end of document                                                         |
| Unclosed MathBlock fence (`$$$`)                        | CDN-0003 | Content runs to end of document                                                         |
| Unclosed NamedBlock (`:::name`)                         | CDN-0004 | Content runs to end of document                                                         |
| ThematicBreak text content dropped                      | CDN-0010 | Text between `---` and optional `{attrs}` is discarded                                  |
| Excess scope-chain `{...}` orphaned                     | CDN-0011 | Excess `{...}` at front of chain discarded; no AST output                               |
| Heading level > 9 (10+ `=` signs)                       | CDN-0012 | Entire line emitted as literal `Text`                                                   |
| `:::` not followed by `[ID_LITERAL]` (nameless opener)  | CDN-0013 | Block candidate parsed as Paragraph; `:::` and `{attrs}` emitted as literal text        |
| Duplicate `id` token (`#id` or `id=` after first claim) | CDN-0020 | Duplicate dropped; first value kept                                                     |
| `class=` alongside `.class` syntax                      | CDN-0021 | `class=` dropped; `.class` tokens kept                                                  |
| Duplicate custom attribute key                          | CDN-0022 | Duplicate dropped; first value kept                                                     |
| `~~~` fence inside a block container                    | CDN-0030 | Raw span (including fence lines) emitted as literal `Paragraph`; no `Meta` node created |
| Crossed inline boundaries (`** __ … ** … __`)           | CDN-0014 | Greedy parse unchanged; diagnostic only — span on the crossing closer                   |

Strict parser profiles (per `./parser-profile-policy.md`) MAY upgrade any `warning` to `error`.
