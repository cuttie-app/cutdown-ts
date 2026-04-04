---
title: Cutdown Compliance Levels Policy
Status: Active
Owner: Language
Scope: Rules for implementation compliance claims
Related:
  - `./conformance-policy.md`
  - `./parser-profile-policy.md`
  - `./compliance-evidence-freshness-policy.md`
  - `./compliance-failure-response-policy.md`
---

# Cutdown Compliance Levels Policy

## Principle

Compliance claims must be evidence-based and scoped.

Implementations may claim only the highest level for which required conformance evidence is published.

## Compliance Levels

- `Level 1: Core`
  - Passes core-language conformance corpus for declared language version.
  - No claim about extension/profile behavior beyond core fallback rules.

- `Level 2: Core+Profile`
  - Meets Level 1.
  - Passes profile-related conformance cases (enabled/disabled extensions, experimental flag states, external-config precedence).
  - Publishes supported profile fields and limits.

- `Level 3: Full`
  - Meets Level 2.
  - Passes all declared extension conformance suites for enabled extension set.
  - Publishes extension coverage manifest and known non-goals.

## Claim Requirements

Any compliance claim must include:

- claimed level,
- language version,
- corpus snapshot version,
- profile/extension coverage manifest,
- test run evidence.

Evidence freshness and revalidation triggers are governed by `./compliance-evidence-freshness-policy.md`.

Failure-triggered claim transitions are governed by `./compliance-failure-response-policy.md`.

## Forbidden Claims

- Unqualified "Cutdown compliant" without level/version.
- Claiming support for extensions not covered by published tests.
- Reusing old evidence after language/corpus version change.
