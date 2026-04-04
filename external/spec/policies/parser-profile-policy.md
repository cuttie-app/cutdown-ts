---
title: Cutdown Parser Profile Policy
Status: Active
Owner: Language
Scope: Deterministic parse configuration
Related:
  - `./conformance-policy.md`
---

# Cutdown Parser Profile Policy

## Profile Model

Every parse must run under an explicit parser profile.

Profile fields:

- `base`: `core`

Two parsers given the same input and same profile must produce the same AST.

There is no implicit "auto" profile.

Profile activation source is external parser/runtime configuration. In-source document declarations are non-authoritative.

## Parse Output Metadata

A conforming parser must expose parse profile metadata alongside AST output:

- `cutdown_version`
- `profile.base`

Metadata can be attached to a parse result envelope or equivalent API field.
