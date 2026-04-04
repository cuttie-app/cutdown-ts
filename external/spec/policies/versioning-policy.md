---
title: Cutdown Versioning Policy
Status: Active
Owner: Language
Scope: Cutdown grammar, parser behavior, and AST contract
Related:
  - `./change-gate.markdown`
  - `./change-publication-policy.md`
---

# Cutdown Versioning Policy

## Contract

Cutdown uses semantic versioning: `MAJOR.MINOR.PATCH`.

- `MAJOR`: breaking language/AST changes.
- `MINOR`: backward-compatible additions.
- `PATCH`: clarifications and bug fixes that do not change valid-input meaning.

The version is the language contract version, not app release numbering.

## Compatibility Guarantees

For any two releases within the same major version:

1. Existing valid documents keep the same parse meaning.
2. Existing core AST node names and field semantics stay stable.
3. Previously invalid syntax may become valid only in a `MINOR` release and must be additive (no reinterpretation of already-valid input).

Consumers may ignore unknown extension nodes/fields, but parsers must emit them when enabled.

## Release Classification Rules

### PATCH

Allowed:

- Spec wording clarifications.
- Parser bug fixes where previous output violated existing spec intent.
- Test corpus additions that confirm existing behavior.

Forbidden in `PATCH`:

- New syntax.
- New AST nodes/fields.
- Precedence changes.
- Behavior that changes AST for previously valid, conforming input.

### MINOR

Allowed:

- New additive syntax.
- New additive AST nodes or optional fields.
- New extensions in `experimental` state.

Required in `MINOR`:

- Explicit fallback behavior for older consumers.
- Ambiguity-matrix updates for new inline tokens.
- Migration notes for producers/consumers.

Forbidden in `MINOR`:

- Removing syntax or nodes.
- Reinterpreting existing valid syntax.
- Tightening rules that invalidate previously valid input.

### MAJOR

Required for:

- Any removal, rename, or semantic reinterpretation of existing syntax/AST.
- Any precedence or whitespace rule change that can alter AST for existing valid input.

Required artifacts:

- Migration guide with before/after examples.
- Compatibility map (old -> new behaviors).
- Deprecation timeline and rollout plan.

## Deprecation and Removal

- Deprecation can begin in a `MINOR` release.
- Deprecated features remain parseable through the rest of that major line.
- Removal can occur only in the next `MAJOR` release.

## Change Gate Integration

Every Cutdown proposal must declare:

- intended version bump (`patch`/`minor`/`major`), and
- justification against this policy.

Change activation timing and lifecycle state are governed by `./change-publication-policy.md`.

If a proposal cannot be classified unambiguously, default to `major` until proven otherwise.
