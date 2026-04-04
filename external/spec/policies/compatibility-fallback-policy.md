---
title: Cutdown Compatibility Fallback Policy
Status: Active
Owner: Language
Scope: Contract behavior for unknown/unsupported syntax under active profile/version
Related:
  - `./parser-profile-policy.md`
  - `./diagnostics-policy.md`
---

# Cutdown Compatibility Fallback Policy

## Principle

Unknown or unsupported constructs must degrade deterministically with diagnostics.

Parsers must not silently reinterpret unknown constructs into different known semantics.

## Required Behavior

When input contains syntax or extension behavior not supported by the active profile/version:

- Continue parsing and return AST.
- Apply documented fallback (typically literal-text or core fallback path).
- Emit structured diagnostics with stable code and span.

## Forbidden Behavior

- Silent reinterpretation into a different construct.
- Non-deterministic fallback choices across runs/implementations.
- Fail-fast rejection as the default mode.

## Conformance Requirements

Conformance tests must include:

- unknown-extension under disabled profile,
- unknown future syntax under current version,
- expected fallback AST and diagnostics for both.
