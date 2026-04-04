---
title: Cutdown Compliance Failure Response Policy
Status: Active
Owner: Language
Scope: Required status transitions when published compliance claims fail
Related:
  - `./compliance-levels-policy.md`
  - `./compliance-evidence-freshness-policy.md`
---

# Cutdown Compliance Failure Response Policy

## Decision

Compliance claims auto-downgrade on failure.

If a previously claimed level no longer passes required conformance evidence, the implementation must immediately publish the highest still-valid level.

## Required Actions on Failure

- Recompute passing level against current claim evidence requirements.
- Downgrade claim to highest passing level without grace period.
- Publish failure scope and impacted capability/extension/profile areas.
- Publish remediation plan and target revalidation steps.

## Disclosure Requirements

Failure notice must include:

- previous claimed level,
- new downgraded level,
- failing corpus snapshot/version references,
- known user impact,
- expected remediation timeline (if available).

## Restoration Rules

- Claim restoration requires new passing evidence for the target level.
- Restoration must reference updated evidence artifacts and run metadata.
