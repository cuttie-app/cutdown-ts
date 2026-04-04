---
title: Cutdown Capability Policy
Status: Active
Owner: Language
Scope: Capability governance for constructs that may touch external systems
Related:
  - `./parser-profile-policy.md`
---

# Cutdown Capability Policy

## Principle

Capabilities are deny-by-default.

No extension may assume access to file system, network, process execution, or similar external resources unless explicitly declared and explicitly allowed by the host environment.

## Capability Manifest

Every extension must define a capability manifest entry:

- `capabilities`: list of required capability IDs
- `capability_reason`: short justification per capability

If no external access is needed, use `capabilities: []`.

## Standard Capability IDs

- `fs.read`
- `fs.write`
- `network.fetch`
- `process.exec`

Additional IDs may be introduced only with Language owner approval.

## Enforcement Rules

- Extension behavior requiring a capability must be gated by explicit allowlist.
- If a required capability is not granted, behavior must degrade deterministically to documented fallback.
- Capability denial must emit a structured diagnostic code and recovery mode.

## Observability

Consumers should expose effective capability grants in parse/runtime metadata for reproducibility and auditability.

At minimum include:

- extension ID,
- requested capabilities,
- granted capabilities.

## Governance Integration

Any new extension proposal must include:

- capability manifest,
- denied-capability fallback behavior,
- conformance vectors for granted and denied capability states.
