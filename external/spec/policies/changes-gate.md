---
title: Cutdown Change Gate
status: Active
scope: Mandatory gate for every proposed change to Cutdown
related:
- `./versioning-policy.md`
- `./conformance-policy.md`
- `./parser-profile-policy.md`
- `./diagnostics-policy.md`
- `./capability-policy.md`
- `./canonical-serialization-policy.md`
- `./compatibility-fallback-policy.md`
- `./conformance-corpus-governance.md`
- `./decision-authority-policy.md`
- `./profile-source-policy.md`
- `./compliance-levels-policy.md`
- `./compliance-evidence-freshness-policy.md`
- `./compliance-failure-response-policy.md`
- `./diagnostic-code-registry-policy.md`
- `./change-publication-policy.md`
- `./cross-implementation-validation-policy.md`
- `./reference-parser-status-policy.md`
- `./governance-review-policy.md`
---

# Cutdown Change Gate

## Purpose

Protect the Cutdown boundary:

- Cutdown owns grammar, parser behavior, and AST shape.
- Cuttie owns runtime behavior, workflow, UI, collaboration, publishing, and permissions.

If a proposal does not prove language relevance, it is out of scope for Cutdown.

## Layer Test (Must Pass)

Classify every proposal before implementation:

- If it changes syntax, parse rules, precedence, normalization, or AST nodes/fields -> Cutdown layer.
- If it changes rendering behavior, workflow, collaboration, permissions, branching, publishing orchestration, or UI -> Cuttie layer.
- If uncertain, default to Cuttie layer until language impact is proven.

## Mandatory Proposal Payload

Every Cutdown proposal MUST include all of the following:

1. Grammar impact
   - Exact syntax addition/change.
   - Ambiguity analysis.
   - Interaction with precedence and whitespace rules.
2. AST diff
   - New/changed node types or fields.
   - Backward-compatibility impact.
3. Consumer fallback
   - How existing consumers behave if they ignore new data.
   - Migration path and compatibility mode expectations.
4. Ambiguity coverage
   - Update `./ambiguity-matrix.md` for every inline token change.
   - Include canonical conflict, escape, malformed, and neighboring-precedence cases.
5. Version impact classification
   - Declare intended version bump (`patch`, `minor`, or `major`) per `./versioning-policy.md`.
   - Justify why the proposal fits that bump level.
6. Conformance payload
   - Add/updated conformance test vectors for happy path, malformed input, escape behavior, and precedence-neighbor interaction.
   - Confirm spec text and tests are aligned per `./conformance-policy.md`.
7. Profile behavior declaration
   - State whether behavior requires a specific parser profile configuration per `./parser-profile-policy.md`.
8. Diagnostics impact declaration
   - Declare whether new/changed diagnostic codes are introduced.
   - Define severity level and deterministic recovery behavior per `./diagnostics-policy.md`.
9. Capability declaration
   - Declare required external capabilities (if any) per `./capability-policy.md`.
   - Define denied-capability fallback and diagnostic behavior.
10. Serialization impact declaration
   - Declare any effect on canonical output ordering/normalization.
   - Update snapshots/rules per `./canonical-serialization-policy.md`.
11. Compatibility fallback declaration
   - Define behavior when construct/profile/version support is missing.
   - Confirm deterministic fallback + diagnostic coverage per `./compatibility-fallback-policy.md`.
12. Corpus evolution declaration
   - Classify conformance corpus changes as additive/fix/breaking.
   - Provide rationale and version-impact mapping per `./conformance-corpus-governance.md`.
13. Profile source declaration
   - Confirm whether behavior depends on external profile configuration.
   - If document-embedded hints exist, define non-authoritative handling per `./profile-source-policy.md`.
14. Compliance-level impact declaration
   - State whether the change affects Level 1/2/3 compliance definitions or evidence expectations.
   - Update claim requirements per `./compliance-levels-policy.md`.
15. Evidence freshness impact declaration
   - State whether the change introduces a new revalidation trigger.
   - Confirm version-triggered evidence rules per `./compliance-evidence-freshness-policy.md`.
16. Compliance failure-response impact declaration
   - State whether the change affects downgrade/restoration obligations.
   - Align failure handling requirements per `./compliance-failure-response-policy.md`.
17. Diagnostic code registry impact declaration
   - State whether new/deprecated/removed diagnostic codes are introduced.
   - Update central code lifecycle records per `./diagnostic-code-registry-policy.md`.
18. Publication lifecycle declaration
   - Assign change lifecycle state (`Draft`/`Accepted`/`Effective`) and target version.
   - Include effective date and migration publication plan per `./change-publication-policy.md`.
19. Cross-implementation validation declaration
   - Confirm required reference-parser validation status.
   - Record optional non-reference implementation results per `./cross-implementation-validation-policy.md`.
20. Reference-parser alignment declaration
   - State whether change introduces temporary reference-parser divergence.
   - If divergent, publish non-conformance disclosure and remediation plan per `./reference-parser-status-policy.md`.
21. Governance-review impact declaration
   - State whether policy amendment needs scheduled-cycle routing or emergency path routing.
   - Define follow-up review obligations per `./governance-review-policy.md`.

Proposals missing any section are rejected as incomplete.

## Cross-Layer Change Policy

If a proposal touches both language and app layers:

- Two-track approval is required:
  - Language owner sign-off.
  - App/workflow owner sign-off.
- One track cannot override the other.

Final language-layer disputes are resolved per `./decision-authority-policy.md`.

## Tie-Break Rule

If the two tracks disagree:

- No language change is merged.
- Ship an app/runtime workaround first.
- Re-open language change only after workaround evidence shows syntax is necessary.

## Out-of-Scope Defaults (for Cutdown)

The following are out of scope unless direct grammar/AST impact is proven:

- Permissions and access control
- Branching model and merge workflow
- Comments/review workflow
- Render theming and export orchestration
- App-side AI behavior and agent policies
