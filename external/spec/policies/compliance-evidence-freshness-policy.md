---
title: Cutdown Compliance Evidence Freshness Policy
Status: Active
Owner: Language
Scope: Validity window rules for published compliance claims
Related:
  - `./compliance-levels-policy.md`
  - `./conformance-corpus-governance.md`
---

# Cutdown Compliance Evidence Freshness Policy

## Decision

Compliance evidence freshness is version-triggered only.

There is no fixed time-based recertification requirement.

## Validity Rules

- A claim remains valid while language version and referenced corpus snapshot remain unchanged.
- Any language version change or corpus snapshot change requires new evidence before claim reuse.
- Evidence must reference exact parser build/version used for the run.

## Claim Revalidation Triggers

- New language version release.
- New conformance corpus snapshot.
- Change in claimed compliance level.
- Change in declared extension/profile coverage manifest.

## Forbidden

- Reusing evidence from a different language or corpus version.
- Presenting stale evidence after coverage manifest changes.
