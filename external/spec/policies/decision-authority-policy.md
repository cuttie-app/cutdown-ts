---
title: Cutdown Decision Authority Policy
Status: Active
Owner: Language
Scope: Final decision authority and dispute resolution for language governance
Related:
  - `./changes-gate.md`
---

# Cutdown Decision Authority Policy

## Authority Model

Cutdown has one Language Owner with final decision authority on language semantics, scope boundaries, and proposal acceptance.

This authority applies to:

- grammar and parser behavior,
- AST contract,
- extension lifecycle decisions,
- policy interpretation for language-layer disputes.

## Appeal Path

Appeals are allowed, written, and time-boxed.

Appeal requirements:

- documented disagreement and proposed alternative,
- concrete impact evidence (compatibility, determinism, migration, or security),
- requested decision change.

Process:

1. Appeal is filed in writing.
2. Language Owner responds with final ruling within a defined review window.
3. Ruling and rationale are recorded in project decision notes/changelog.

## Override Criteria

An appeal may override a prior ruling only if one or more are proven:

- material contradiction with approved policies,
- unanticipated major compatibility break,
- security or safety risk not considered in original ruling.

Preference disagreements alone do not qualify for override.

## Transparency Requirements

- Final rulings must reference the governing policy sections used.
- Rejected appeals must include a concise rationale.
- Accepted appeals must include migration and communication steps where relevant.
