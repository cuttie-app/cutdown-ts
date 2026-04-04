---
title: Cutdown Profile Source Policy
Status: Active
Owner: Language
Scope: Source of truth for parser profile and experimental flag activation
Related:
  - `./parser-profile-policy.md`
  - `./compatibility-fallback-policy.md`
---

# Cutdown Profile Source Policy

## Decision

Parser profile and experimental flags are external configuration only.

Documents must not be able to authoritatively set active profile or flags in-source.

## Rationale

- Keeps execution control with host/runtime policy.
- Avoids hidden behavior changes when moving documents across environments.
- Preserves deterministic CI and production rollout controls.

## Contract Rules

- Active profile is defined by parser/runtime invocation context.
- In-source metadata that attempts to set profile/flags is non-authoritative.
- Parsers may expose informational diagnostics when such declarations are present.

## Conformance Requirements

Conformance tests must include cases where in-source profile/flag declarations appear and verify they do not override external configuration.
