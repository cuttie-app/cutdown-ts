---
title: Cutdown Diagnostic Code Registry Policy
Status: Active
Owner: Language
Scope: Governance of stable diagnostic code IDs and lifecycle
Related:
  - `./diagnostics-policy.md`
  - `./versioning-policy.md`
  - `./diagnostic-code-registry.md`
---

# Cutdown Diagnostic Code Registry Policy

## Decision

Diagnostic codes are governed by a central registry with lifecycle states.

Codes are contract-level identifiers and must remain stable for tooling.

## Registry Requirements

Each diagnostic code entry must include:

- `code`
- `title`
- `level` (`error` | `warning` | `info`)
- `trigger`
- `recovery`
- `introduced_in`
- `status` (`active` | `deprecated` | `removed`)
- `owner`

## Compatibility Rules

- Reusing an existing code for different semantics is forbidden.
- Meaning changes require new code ID and migration note.
- Deprecation may occur in minor releases.
- Removal requires major-version justification.

## Tooling Guarantees

- Parsers must emit registry-defined codes when applicable.
- Unknown codes in downstream tooling should be handled as non-fatal and surfaced with raw metadata.
