---
title: Cutdown Cross-Implementation Validation Policy
Status: Active
Owner: Language
Scope: Validation requirements across parser implementations for language changes
Related:
  - `./conformance-policy.md`
  - `./change-publication-policy.md`
  - `./reference-parser-status-policy.md`
---

# Cutdown Cross-Implementation Validation Policy

## Decision

Reference parser conformance is the required release gate.

Cross-implementation runs beyond the reference parser are encouraged but not required for change effectiveness.

## Required Gate

- For a change to reach `Effective`, the reference parser must pass the required conformance corpus for the target version.

Reference parser governance status and divergence rules are defined in `./reference-parser-status-policy.md`.

## Optional Validation

- Additional parser implementations may run the same corpus and publish results.
- These results are advisory and do not block `Effective` transition.

## Transparency Rule

- If non-reference implementations are known to diverge, release notes should include compatibility notes.
