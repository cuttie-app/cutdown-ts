# Cutdown Markup Language Specification

- **Status:** Draft
- **Version:** 0.3.3
- **Date:** 2026-04-04
- **Inspired by:** Djot, CommonMark
- **Versioning policy:** [`policies/versioning-policy.md`](policies/versioning-policy.md)
- **Change publication policy:** [`policies/change-publication-policy.md`](policies/change-publication-policy.md)
- **Conformance policy:** [`policies/conformance-policy.md`](policies/conformance-policy.md)
- **Parser profile policy:** [`policies/parser-profile-policy.md`](policies/parser-profile-policy.md)
- **Diagnostics policy:** [`policies/diagnostics-policy.md`](policies/diagnostics-policy.md)
- **Diagnostic code registry policy:** [`policies/diagnostic-code-registry-policy.md`](policies/diagnostic-code-registry-policy.md)
- **Diagnostic code registry:** [`policies/diagnostic-code-registry.md`](policies/diagnostic-code-registry.md)
- **Capability policy:** [`policies/capability-policy.md`](policies/capability-policy.md)
- **Canonical serialization policy:** [`policies/canonical-serialization-policy.md`](policies/canonical-serialization-policy.md)
- **Compatibility fallback policy:** [`policies/compatibility-fallback-policy.md`](policies/compatibility-fallback-policy.md)
- **Conformance corpus governance:** [`policies/conformance-corpus-governance.md`](policies/conformance-corpus-governance.md)
- **Decision authority policy:** [`policies/decision-authority-policy.md`](policies/decision-authority-policy.md)
- **Profile source policy:** [`policies/profile-source-policy.md`](policies/profile-source-policy.md)
- **Compliance levels policy:** [`policies/compliance-levels-policy.md`](policies/compliance-levels-policy.md)
- **Compliance evidence freshness policy:** [`policies/compliance-evidence-freshness-policy.md`](policies/compliance-evidence-freshness-policy.md)
- **Compliance failure response policy:** [`policies/compliance-failure-response-policy.md`](policies/compliance-failure-response-policy.md)
- **Cross-implementation validation policy:** [`policies/cross-implementation-validation-policy.md`](policies/cross-implementation-validation-policy.md)
- **Reference parser status policy:** [`policies/reference-parser-status-policy.md`](policies/reference-parser-status-policy.md)
- **Governance review policy:** [`policies/governance-review-policy.md`](policies/governance-review-policy.md)

---

## Abstract

Cutdown is a lightweight markup language designed to produce a structured AST (Abstract Syntax Tree). It has no canonical HTML output — consuming applications interpret and render the AST. The reference consumer is the Cuttie application.

Cutdown prioritizes **unambiguous parsing**, **consistency**, and **implementability**. Every syntactic construct is locally deterministic. The parser never backtracks.

Cutdown is a simple markup language with the bare minimum features to structure content. It does not have a goal to satisfy all varieties of representing content in ASCII.

---

## Table of Contents

1. [Conventions](001-conventions.md)
2. [Input Normalization](002-input-normalization.md)
3. [Segments](003-segments.md)
4. [Escaping](004-escaping.md)
5. [Universal Attributes](005-universal-attributes.md)
   - 5.1 Syntax
   - 5.2 Placement
6. [Block Interface](006-block-interface.md)
7. [Document Model](007-document-model.md)
   - 7.4 Pages
8. [Block Structure](008-block-structure.md)
   - 8.5 Syntax Primitives
9. [Block Elements](009-block-elements.md)
   - 9.1 Headings
   - 9.2 Paragraphs
   - 9.3 Thematic Break
   - 9.4 Code Block
   - 9.5 Meta block (Frontmatter)
   - 9.6 QuoteBlock
   - 9.7 Lists (Task Items)
   - 9.8 Tables
   - 9.9 File References
   - 9.10 Named Block
   - 9.11 Reference Definition
   - 9.12 Block Math Formula
   - 9.13 Comments
10. [Inline Elements](010-inline-elements.md)
    - 10.1 Text
    - 10.2 Emphasis
    - 10.3 Strong
    - 10.4 Strikethrough
    - 10.5 Inline Code
    - 10.6 Text Break
    - 10.7 Links
    - 10.8 Inline Image
    - 10.9 Named Span
    - 10.10 Inline Math Formula
    - 10.11 Variable
    - 10.12 Inline Quote
11. [Precedence Rules](011-precedence-rules.md)
12. [Whitespace Rules](012-whitespace-rules.md)
13. [Parsing Algorithm](013-parsing-algorithm.md)
14. [AST Node Reference](014-ast-node-reference.md)
15. [Special Character Reference](015-special-character-reference.md)
16. [Name and Compliance](016-name-and-compliance.md)

---
