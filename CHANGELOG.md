# Changelog

## 0.5.0 — 2026-08-21

Reference implementation release preparation. The implementation is
release-ready in this repository; npm publication, a version tag, a GitHub
release, and a Pages deployment remain maintainer actions.

- Packaged the `orgmd` ESM library and Node 20+ CLI, including package asset
  verification and a tarball consumer smoke test.
- Published the entry front-matter JSON Schema and the data-first Core v0.1
  conformance corpus, including resolver and compiler profiles.
- Corrected the schema and Core corpus to treat `id` as logical-entry identity,
  (`id`, `rev`) as revision identity, and `rev` as a positive safe integer;
  Core conformance corpus 0.1.1 locks numeric ordering and duplicate-pair
  failure without changing valid content identifiers.
- Added the deterministic resolver, scope-aware advisory compiler, stable
  diagnostics, and the five CLI commands: validate, compile, doctor, init,
  and adopt.
- Added preview-first scaffolding and Markdown adoption with explicit
  confirmations; imported content is written as draft material for review.
- Migrated the repository dogfood bundle to the DEC-0003 lifecycle model and
  made validation, doctor, test, build, and pack checks part of CI.
- The only implemented projections are advisory `agents-md` and `prompt`
  text. No MCP gate, runtime enforcement, hosted service, signing, or handbook
  renderer is included in 0.5.0.

## 0.3.1-draft — August 2026

Correctness and clarity release. Implements the accepted items of
`rfcs/review-triage-2026-08.md` (triage of the August 2026 independent
review): BLOCKER 1–3, HIGH 4, 6 and 7, plus the drift item on the Core
"afternoon" claim. No new concepts.

- Revision identity made internally consistent: `id` names one logical entry
  per bundle, revision records are unique by (`id`, `rev`), every revision is
  hashed in UTF-8 `id` then numeric `rev` order, and revision numbers are
  positive safe integers (SPEC §4, §5, §7.1; RFC 0016)
- Ratification split from lifecycle state: a revision's `status` is
  ratification only (`draft` / `approved` / `rejected`), while
  contestation and retirement are entry-level acts, removing the
  resurrection hazard by which contesting or retiring a revision silently
  elected an older one (SPEC §2, §4.1, §4.7, §5, §6.3, §7.2, §11)
- Bundle-level metadata folded into the content identifier: a canonical
  bundle metadata object covering the bundle id, the scope lattice, the
  grace window and entry lifecycle state, digested ahead of the entry
  lines, with the general rule that every value capable of changing
  resolution, disclosure, identity or authority must change the identifier
  — and a conformance vector asserting it (SPEC §7.1, §5.5, §4.2, §4.5)
- Entry lifecycle state given a normative bundle representation: a
  reserved `lifecycle:` mapping on the bundle's identity entry, keyed by
  entry `id`, carrying `state` (`contested` / `retired`), `by`, `date` and
  `ref`, recorded and withdrawn by reviewed write without touching any
  revision — the single authored form from which validation, resolution
  and the content identifier are derived, with `by` / `date` / `ref`
  excluded from the hash as provenance (SPEC §4.1, §7.1, §4.7, §5)
- Grace window given the key it is authored under: `grace_days:` on the
  root bundle's identity entry, a non-negative integer number of days
  capped at 90, a validation error otherwise, ignored and reported in a
  non-root bundle (SPEC §4.8, §7.1)
- Disclosure Mode A is the only conforming Core behaviour; Mode B is an
  Extended capability requiring an explicit deployment-wide declaration,
  and where active the declared mode is a resolver input carried in the
  context identifier and stated in the conformance claim (SPEC §5.4, §5,
  §5.5, §11)
- Core role binding clarified: Core validates organisational semantics
  only; identity-backed ratification is an Extended guarantee via the IdP
  mapping, and no role-binding data is added to bundles (SPEC §9, §11)
- Raw-bundle storage invariant: scope filtering is a property of
  resolution, not storage, so raw bundle access must be at least as
  restrictive as its most restricted entry, and finer separation means
  separate per-compartment bundles (SPEC §4.2; SECURITY.md)
- Classification boundary stated: ORG.md policy actions are
  already-classified organisational actions and the decision function
  evaluates no business data; value-dependent rules are pre-classified
  actions or an authored `escalate` whose prose states the condition
  (SPEC §4.6)
- §7.2–§7.6 marked Experimental pending a second independent
  implementation — binding on Extended claims, unvalidated by
  implementation evidence (SPEC §7)
- The Core "afternoon" claim now separates adopting a bundle with
  conformant tooling from implementing a conformant resolver (SPEC §11)
- Compiler conformance evaluated per canonical target profile: a
  versioned, separately published rendering specification for a
  machine-oriented target, named in the claim, against which byte-identical
  output is required; human-oriented targets with no published profile are
  evaluated against the §6.1 rules alone and must not claim byte-identity.
  This specification defines no canonical target profiles yet (SPEC §11,
  §6.2)
- The §7.1 bundle metadata digest added to the `org.lock` targets content,
  so the metadata object that changes resolution and disclosure is signed
  exactly as entry digests are, rather than being covered only by
  whole-directory file hashing (SPEC §7.2, §7.1)

## 0.3-draft — August 2026

Resolves issues #1–#15 (adversarial review of 0.2-draft). RFCs 0001–0015
accepted by the editor 2026-08-21 (comment period waived under DEC-0002);
decisions DEC-0008..DEC-0022 recorded; DEC-0003 superseded by DEC-0022.

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
