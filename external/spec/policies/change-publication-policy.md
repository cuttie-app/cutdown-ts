---
title: Cutdown Change Publication Policy
Status: Active
Owner: Language
Scope: Process for publishing and activating language changes
Related:
- `./versioning-policy.md`
- `./governance-review-policy.md`
---

# Cutdown Change Publication Policy

## Decision

Language changes follow a staged RFC lifecycle before becoming effective.

Lifecycle states:

- `Draft`
- `Accepted`
- `Effective`

## State Requirements

### Draft

Must include:

- problem statement and proposed behavior,
- grammar/AST impact,
- version target (`patch`/`minor`/`major`),
- initial conformance plan.

### Accepted

Must include:

- final decision rationale,
- migration/fallback notes,
- conformance updates prepared,
- planned effective date.

### Effective

May be marked only when:

- spec text is merged,
- conformance corpus updates are merged,
- required governance records are updated,
- effective date has been reached.

## Publication Rules

- No behavior is normative as "effective" while in `Draft` or `Accepted` state.
- Each accepted change must publish a unique change ID and target version.
- Effective changes must be listed in release notes/changelog.

Governance-policy amendments additionally follow `./governance-review-policy.md` cadence and emergency routing rules.
