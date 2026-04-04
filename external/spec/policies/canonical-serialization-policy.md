---
title: Cutdown Canonical Serialization Policy
Status: Active
Owner: Language
Scope: Byte-stable canonical representation of parse results
Related:
  - `./conformance-policy.md`
  - `./diagnostics-policy.md`
---

# Cutdown Canonical Serialization Policy

## Goal

Different conforming implementations must be able to produce byte-identical serialized parse results from the same input and profile.

## Canonical Envelope

Canonical serialized output contains:

- `cutdown_version`
- `profile`
- `ast`
- `diagnostics`

## Ordering Rules

- Object keys are emitted in lexicographic order.
- Arrays preserve semantic order from parsing.
- `diagnostics` are sorted by (`start_line`, `start_col`, `code`).
- `profile.extensions` are sorted lexicographically.

## Normalization Rules

- No insignificant whitespace in canonical JSON.
- Strings use JSON standard escaping.
- Null fields are included only when required by schema; optional absent fields are omitted.
- Numeric fields use canonical decimal form (no leading plus, no unnecessary leading zeros).

## AST/Diagnostics Shape Stability

- Node field names and diagnostic field names are contract-bound.
- Renaming, adding required fields, or changing field semantics follows versioning policy.

## Conformance Requirements

Conformance corpus must include canonical serialized snapshots for representative cases, including malformed/recovery cases with diagnostics.
