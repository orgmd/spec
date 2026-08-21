# Changelog

## 0.3-draft — August 2026

Resolves issues #1–#15 (adversarial review of 0.2-draft); RFCs 0001–0015
open for comment.

- Entry identity is bundle-scoped, with an id grammar; the multi-entry
  file container gets a published grammar (SPEC §3.1, §4.5; RFC 0001,
  0003)
- Scope becomes a declared lattice, and clearance governs disclosure, not
  applicability — resolve first, redact on emission (SPEC §4.2, §5.4; RFC
  0002, 0008)
- Policies become a decision function: `action` / `effect` / `route`,
  two-stage verdict, and structural narrowing replaces `narrows:` (SPEC
  §4.6, §5; RFC 0005, 0006)
- Entries carry revisions; a normative sync state machine, staleness with
  consequences, and an owner of last resort (SPEC §4.3, §4.7, §4.8, §9;
  RFC 0012, 0013)
- Resolution runs over one designated path, and every result carries a
  context identifier (SPEC §5.1, §5.5; RFC 0004)
- Ownership and decisions resolve from their anchoring bundle, not
  closest-wins (SPEC §5.2; RFC 0011)
- Resolution failure is defined: error codes, blast radius, no ancestor
  fallback, gates deny (SPEC §5.3; RFC 0007)
- `contested` propagates by reliance only, and the transition is
  authority-bounded and attributable (SPEC §4.1; RFC 0010)
- `enforced` requires interposition, not merely a deployed gate (SPEC
  §6.4; RFC 0009)
- Integrity mechanised: TUF roles, path delegation, whole-directory
  hashing, forward-only recovery with a freeze horizon, and a Core
  content identifier (SPEC §7; RFC 0014)
- Conformance split from benchmark score: conformance is for resolvers,
  compilers and gates; agents get scores (SPEC §11, constitution
  principle 10; RFC 0015)

## 0.2-draft — August 2026
- Resolution replaces inheritance (definitions closest-wins; constraints stack, only narrow)
- Status model: draft / approved / contested / superseded; staleness computed
- No confidence field (DEC-0005)
- Agents propose, humans ratify (normative, SPEC §9)
- Maintenance & drift (SPEC §10); resolver conformance (SPEC §11)
- org.lock profiled on TUF/Sigstore; MADR alignment; OTel org.context.* namespace
- Constitution (12 principles) and seed decisions DEC-0001..0007

## 0.1-draft — August 2026
- Initial specification, docs package, and launch site
