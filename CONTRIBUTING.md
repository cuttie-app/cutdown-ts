# Contributing to cutdown-parser

## Getting Started

### Prerequisites
- Node 24 or later
- pnpm

### Setup

```bash
git clone https://github.com/cuttie-app/cutdown-ts.git
cd cutdown-ts
pnpm install
```

In order to run the tests, you also need to have `cutdown-spec` installed locally. You can clone it in a sibling directory:

```bash
git clone https://github.com/cuttie-app/cutdown-spec.git src/spec
```

### Development Commands
- `pnpm check:ts` — typecheck (read-only)
- `pnpm check:format` — check code formatting (read-only)
- `pnpm check:lint` — lint code (read-only)
- `pnpm format` — auto-format code
- `pnpm test` — run test suite
- `pnpm build` — build the distribution

## Relationship to cutdown-spec

This parser is a **conformant implementation** of [`cutdown-spec`](https://github.com/cuttie-app/cutdown-spec). The specification is the source of truth — not this repository.

Key governance documents in the spec:
- **`policies/conformance-policy.md`** — Specification prose and conformance test corpus are authoritative. Divergence between them is a release blocker.
- **`policies/versioning-policy.md`** — Version bumps are driven by specification changes, not by parser implementation changes alone.
- **`CONTRIBUTION.md`** — Proposal-first workflow for new syntax and language features.

## Version Policy (Tied to cutdown-spec)

`cutdown-ts` versions mirror the specification's MAJOR.MINOR.PATCH scheme:

| Bump | Trigger |
|------|---------|
| MAJOR | Breaking language or AST change in spec |
| MINOR | Additive spec change (new syntax, optional AST fields) |
| PATCH | Spec clarification, parser bug fix, test additions only |

### Key Rules
- **Version alignment**: `cutdown-ts@v0.3.5` implements `cutdown-spec@v0.3.5` — the versions must match.
- **CI enforcement**: The publish workflow automatically checks out `cutdown-spec@v<version>`. If that tag doesn't exist, the build fails.
- **Pre-release versions**: `0.3.5-rc.1` is valid; it still maps to spec tag `v0.3.5`.
- **No independent bumps**: Do not bump `cutdown-ts` version without a corresponding spec change. Version bumps must be justified by a change to the specification.

## What Requires a Spec Proposal

Per [`cutdown-spec/CONTRIBUTION.md`](https://github.com/cuttie-app/cutdown-spec/blob/main/CONTRIBUTION.md), the following require a **proposal-first** workflow (issue before PR):
- New language syntax or constructs
- Diagnostic codes
- Extension proposals

Once the Language Owner approves the proposal in the spec repo, you can proceed with a parser implementation PR.

## Direct PR Contributions

The following are acceptable as direct PRs (no proposal required):
- Bug fixes in parsing behavior
- Performance improvements
- Test additions and improvements
- Documentation and clarification

## Parser PR Checklist

Before opening a PR:
- [ ] All check scripts pass: `pnpm run check:ts && pnpm run check:format && pnpm run check:lint`
- [ ] Test suite passes: `pnpm test`
- [ ] If parser behavior changes: corresponding spec prose and conformance tests are updated in `cutdown-spec`
- [ ] If version bump: version matches spec versioning policy (see table above)
- [ ] Commit messages are clear and reference any related spec changes

## Release Process

1. The version is bumped in `package.json` (matching a spec version)
2. A git tag `v<version>` is created
3. Push the tag to trigger the publish workflow
4. The CI workflow:
   - Checks out `cutdown-spec@v<version>` (fails if tag absent)
   - Runs all checks and tests
   - Publishes to npm with OIDC provenance

For pre-release versions, use: `npm version prerelease --preid=rc` (or similar).
