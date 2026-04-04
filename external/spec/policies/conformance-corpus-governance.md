---
title: Cutdown Conformance Corpus Governance
Status: Active
Owner: Language
Scope: Evolution policy for normative conformance corpus
Related:
  - `./conformance-policy.md`
  - `./versioning-policy.md`
---

# Cutdown Conformance Corpus Governance

## Principle

The conformance corpus is versioned and auditable.

Each language release maps to an explicit corpus snapshot so teams can compare behavior over time.

## Versioned Snapshots

- Maintain corpus snapshots by language version (for example `v0.1.1`).
- A release must reference the exact corpus version used for conformance verification.
- Historical snapshots are immutable after release.

## Change Classes

Every corpus change must be labeled as one of:

- `additive`: new coverage without changing expected results of existing cases.
- `fix`: correction where previous expected result contradicted normative policy/spec intent.
- `breaking`: expected result change that alters behavior for previously conforming implementations.

## Required Metadata Per Change

Each corpus change entry must include:

- change class (`additive`/`fix`/`breaking`)
- rationale
- affected rule(s)/policy section(s)
- version impact (`patch`/`minor`/`major`)

For `breaking` changes, include migration guidance.

## Release Gate

- No release without a pinned corpus snapshot.
- `breaking` corpus changes require explicit owner sign-off and alignment with versioning policy.
