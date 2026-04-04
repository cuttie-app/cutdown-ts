# Contributing to Cutdown

## What you can contribute

| Type                                                                       | Process                         |
| -------------------------------------------------------------------------- | ------------------------------- |
| Spec text — corrections, clarifications, typo fixes (`spec/`, `policies/`) | Open a PR directly              |
| Conformance tests (`tests/`)                                               | Open a PR directly              |
| Language proposals — new syntax, constructs, diagnostic codes              | File an issue first (see below) |
| Extension proposals (`extensions/`)                                        | File an issue first (see below) |

---

## Test requirements

Every change that affects spec language behavior must include, before merge:

- [ ] At least one canonical success case in `tests/`
- [ ] At least one malformed/unclosed case with expected diagnostic code and level
- [ ] At least one escape interaction case
- [ ] At least one precedence-neighbor interaction case

These requirements come from the [conformance policy](policies/conformance-policy.md). Spec and tests must be aligned — a divergence between spec prose and golden tests is a release blocker.

---

## Language proposals

New syntax, constructs, or extensions require a written proposal **before** any implementation work begins. This prevents sunk-cost situations where a PR arrives before an ownership decision is made.

1. File a GitHub Issue using the [Language Proposal template](.github/ISSUE_TEMPLATE/language-proposal.md).
2. The Language Owner reviews and responds with a ruling.
3. Only after a ruling is recorded may a PR be opened.

Appeals to rulings follow the process in the [decision authority policy](policies/decision-authority-policy.md).

---

## Code of conduct

Be respectful and constructive. This is a small, focused project with one Language Owner. Disputes are resolved by the Language Owner per the [decision authority policy](policies/decision-authority-policy.md). If you disagree with a ruling, the written appeal process is documented there.
