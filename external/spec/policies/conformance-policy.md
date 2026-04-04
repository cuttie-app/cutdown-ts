---
title: Cutdown Conformance Policy
Status: Active
Owner: Language
Scope: Defines normative sources and release conformance requirements
Related:
- `./ambiguity-matrix.md`
- `./diagnostics-policy.md`
- `./diagnostic-code-registry-policy.md`
- `./canonical-serialization-policy.md`
- `./compatibility-fallback-policy.md`
- `./conformance-corpus-governance.md`
- `./compliance-levels-policy.md`
- `./compliance-evidence-freshness-policy.md`
- `./compliance-failure-response-policy.md`
- `./cross-implementation-validation-policy.md`
- `./reference-parser-status-policy.md`
---

## Normative Sources

When behavior is evaluated, authority is ordered as follows:

1. Language specification (`/spec/`)
2. Conformance test corpus (normative executable examples)

Implementation behavior is not authoritative by itself.

Reference parser authority and divergence handling are governed by `./reference-parser-status-policy.md`.

## Divergence Rule

If spec prose and conformance tests diverge:

- Treat as a release blocker.
- Do not ship until both are aligned.
- Resolution requires explicit owner decision recorded in changelog/decision note.

Conformance corpus evolution is governed by `./conformance-corpus-governance.md`.

## Conformance Corpus Requirements

The conformance corpus must include:

- Valid parsing examples with expected AST snapshots.
- Invalid/malformed cases with expected fallback behavior.
- Expected diagnostics (code + level) for malformed/recovery cases.
- Canonical serialized output snapshots for selected cases.
- Compatibility fallback cases for unsupported profile/version constructs.
- External-config precedence over in-source profile hints.
- Precedence and escape interaction cases.
- Cross-feature interaction cases for neighboring precedence tiers.

For every new inline token or precedence change, the ambiguity matrix cases must be represented in conformance tests.

## Release Gate

A release is conformant only if:

1. Conformance tests pass on the reference parser.
2. No unresolved spec-vs-test divergence exists.
3. Any intentional behavior change includes updated spec text and updated tests in the same change.

Cross-implementation validation requirements are governed by `./cross-implementation-validation-policy.md`.

Implementation compliance claims are governed by `./compliance-levels-policy.md`.

## Authoring Rule for New Features

Every language proposal must provide, before merge:

- at least one canonical success case,
- at least one malformed/unclosed case,
- at least one escape case,
- at least one precedence-neighbor interaction case.
