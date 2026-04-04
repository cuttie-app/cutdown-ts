---
title: Cutdown Reference Parser Status Policy
Status: Active
Owner: Language
Scope: Governance role of the reference parser relative to spec and conformance
Related:
  - `./conformance-policy.md`
  - `./cross-implementation-validation-policy.md`
---

# Cutdown Reference Parser Status Policy

## Decision

Cutdown is spec-first.

Language specification and conformance corpus are authoritative. The reference parser must follow them.

## Divergence Handling

If the reference parser diverges from accepted spec/conformance behavior:

- mark the affected behavior as reference-parser non-conformant,
- track remediation with an explicit alignment task,
- do not reinterpret spec authority to match parser behavior by default.

## Release Transparency

- Known reference-parser divergence must be disclosed in release notes.
- Disclosures must include scope, impact, and expected fix status.
