# ORG.md Scale Proof Plan

**Status:** Phase 0 conditional Go; later phases remain gated  
**Date:** 2026-09-01  
**Target:** A credible internal proof that preserves founder simplicity while establishing a defensible path to enterprise scale

**Review outcome:** Go for Phase 0. The reference implementation and an
all-revisions conformance vector already implement `(id, rev)` ordering, so
Phase 0 will preserve their existing behaviour, correct every contradictory
normative clause and add the missing duplicate-pair and numeric-ordering
coverage. Revision numbers will be bounded to positive IEEE-754 safe integers
so independent implementations can apply the same numeric ordering.

## 1. Objective

Prove that ORG.md can remain a small, understandable authoring format while
supporting organisational meaning that is:

- owned and reviewed by accountable people;
- composed deterministically across more than one organisational hierarchy;
- published separately from draft authoring state;
- delivered as bounded, traceable advisory context;
- measurable in a real small organisation; and
- capable of later federation without requiring a fork of Git or a monolithic
  `org.md` file.

The immediate target is not a finished enterprise platform. It is the smallest
proof that removes the known architectural contradictions and tests whether the
model deserves further hardening.

## 2. Definition of done

The scale proof is complete when all of the following are true:

1. The specification unambiguously supports multiple revisions of one entry and
   the reference implementation matches it.
2. Git authoring state and published effective context have distinct identifiers;
   adding a draft does not change the published effective-context identifier.
3. An approval is represented by a verifiable attestation over an immutable
   revision-payload digest that does not change when ratification state moves
   from `draft` to `approved`, plus approver identity, owner role and time.
4. Four bundles — company, legal entity, product and repository — are stored in
   at least three Git repositories.
5. Two consumers resolve different, declared combinations of those bundles.
6. A versioned composition manifest declares mandatory inputs, applicability,
   precedence and conflict behaviour.
7. Missing mandatory inputs, unverifiable approvals, unsupported required
   features and unresolved conflicts fail explicitly.
8. Conformance vectors cover revision hashing, authoring/publication separation,
   composition, ratification, version negotiation and failure cases.
9. A benchmark reports cold and warm resolution time, memory, path size and the
   number of affected consumers after a single-entry change.
10. A real internal pilot contains 20–50 high-value entries and measures the same
    tasks without and with ORG.md advisory context.
11. One drift exercise demonstrates propose → review → attest → publish → resolve
    → deliver, with an audit trail.
12. The public site demonstrates the proof without implying authenticated access,
    enforcement, federation or enterprise readiness.

## 3. Product and architecture principles

1. **Git remains the authoring substrate.** Do not fork Git. Business approval,
   publication, composition and delivery sit above it.
2. **Small bundles, never one enormous file.** Split by accountable ownership or
   raw-storage boundary, not arbitrary size alone.
3. **Authoring is not publication.** Drafts and rejected revisions remain in the
   authoring repository; runtime consumers receive immutable effective-only
   artifacts.
4. **A status token is not approval evidence.** Publication requires a verifiable
   approval attestation for the exact content being published.
5. **Composition is declared.** A matrix organisation is represented by an
   external manifest, not inferred from repository layout or flattened into an
   accidental total order.
6. **ORG.md governs meaning, not business data.** Contextual authorisation remains
   with established identity and policy systems such as an IdP, OPA or Cedar.
7. **Scale claims require measurements.** No enterprise claim is made without
   resource limits, benchmark results and failure-mode evidence.
8. **The simple path stays simple.** A founder can still use one repository, one
   bundle and one approval convention without deploying enterprise services.

## 4. Target system boundary

```text
Git authoring repositories
          |
          v
approval verification and publication
          |
          v
immutable effective-only artifacts ----> federated bundle registry
          |                                      |
          +------------------+-------------------+
                             v
                 signed composition manifest
                             |
                             v
                 cached incremental resolver
                       /             \
                      v               v
             advisory delivery   policy-engine input
                      \               /
                       v             v
                    external audit trail
```

The proof implements the smallest local versions of these boundaries. It does
not need a hosted service or production federation.

## 5. Sequenced delivery plan

### Phase 0 — Correct the public and normative record

**Purpose:** Remove contradictions before building on them.

Work:

- Amend the content-identifier rule to sort by `(id, rev)` and reject duplicate
  `(id, rev)` pairs, not repeated IDs.
- Add a multi-revision identifier conformance vector.
- Correct stale governance examples that use `status: contested` or
  `status: superseded`.
- Change the site scale language from an achieved claim to a design intent.
- Clarify that being outside a selected advisory view is not an access-control
  boundary.
- Add authenticated approval and enterprise-volume benchmarking to the visible
  list of things the proof does not yet provide.

Deliverables:

- One narrow specification RFC and decision record.
- Updated conformance vector and reference implementation, if required by the
  accepted wording.
- Updated governance documentation and public-site claims tests.

Gate:

- The normative prose, schema, conformance vectors and implementation agree on
  multi-revision identity.
- No public page implies that the current local-path proof demonstrates
  multi-repository or enterprise operation.

Estimated effort: 2–4 focused days.

### Phase 1 — Decide the protocol contracts

**Purpose:** Settle the minimum architecture before parallel implementation.

Create a small RFC pack covering four contracts:

#### 1A. Authoring and publication

- Define an authoring-state identifier and an effective-publication identifier.
- Require stable bundle identifiers in cross-repository publication profiles;
  Core's runtime-reference fallback is not durable identity for signed
  composition.
- Define an immutable effective-only published artifact.
- State which lifecycle and provenance information accompanies the artifact.
- Define forward-only replacement and withdrawal behaviour.

#### 1B. Ratification attestation

- Define a `revision_payload_digest` over the exact semantic payload being
  approved, including `id`, `rev`, accountable fields and body but excluding
  mutable ratification workflow state. Keep it distinct from the Core
  authoring-state content identifier, whose entry digest includes `status`.
- Sign `(bundle, entry id, revision, revision_payload_digest)` and require the
  publisher to prove that the stored revision payload still matches it before
  changing ratification state or publishing.
- Carry approver subject, identity issuer, role, time and approval-policy version.
- Use a standard signature envelope and existing trust systems. Treat the local
  identity provider as a fixture or adapter, never a new identity service.
- Allow a simple single-owner policy now, while permitting quorum and separation
  of duties as later approval-policy profiles.
- Require publication to reject missing, invalid or stale attestations.
- Present the ordinary owner action as “approve this exact wording”; keep digest
  and signature detail behind progressive disclosure.

#### 1C. Composition manifest

- Identify the consumer or consumer class.
- Name required bundles and immutable versions or version rules.
- Resolve every version rule to an exact immutable publication identifier before
  composition. Receipts and context identifiers carry the resolved inputs, never
  a floating rule.
- Label each input as base, mandatory overlay or optional overlay.
- Define applicability, semantic-kind precedence and conflict behaviour.
- Preserve conjunctive constraints; return an explicit conflict for incomparable
  definitions.
- Make missing mandatory overlays fail closed.
- Keep the semantic choices fixed: manifests select inputs and declared
  applicability but MUST NOT introduce organisation-specific resolution
  algorithms.
- Bind every deterministic input into the composition receipt and resulting
  context identifier: exact publication identifiers, the resolved manifest,
  profile versions, required capabilities, applicable time, disclosure mode and
  consumer selector.
- Distinguish authentication from integrity. A checksum-only local profile is
  explicitly unauthenticated; it is not equivalent to a signed manifest.
- In owner-facing material, describe these as required or optional guidance from
  Company, Legal, Product and Repository. Keep base/overlay terminology in the
  builder contract.

#### 1D. Compatibility and capabilities

- Add authored `spec_version` and `requires` declarations.
- Version the composition and publication profiles independently.
- Require old resolvers to reject unknown required capabilities.
- Publish a compatibility table and migration rule.

Deliverables:

- Accepted RFCs or explicitly time-boxed experimental profiles.
- JSON Schemas for the publication artifact, approval attestation and composition
  manifest.
- Example fixtures and failure examples reviewed before implementation.

Gate:

- Every field has one authoritative meaning.
- A second implementation could be written without reading reference code.
- The founder path remains valid with defaults: one bundle, one manifest generated
  implicitly, and a local approval profile clearly labelled as non-authenticated.

Estimated effort: 1–2 weeks including review.

### Phase 2 — Build the v0.6A matrix-composition proof

**Purpose:** Demonstrate the new contracts end to end.

Workstream A — bundle loading and composition:

- Load immutable bundle artifacts from three local Git repositories.
- Resolve a signed composition manifest. A checksum-only local fixture MAY be
  used when clearly labelled unauthenticated.
- Implement mandatory overlays, deterministic ordering and explicit conflicts.
- Produce a composition receipt containing every exact input and result.

Workstream B — approval and publication:

- Implement a local test identity provider and signer interface.
- Generate and verify exact-revision approval attestations.
- Publish effective-only artifacts.
- Demonstrate that drafts change authoring state without changing the published
  context identifier.

Workstream C — conformance and performance:

- Add data-first conformance vectors before implementation is considered done.
- Add aggregate entry, byte, path-depth and time budgets.
- Benchmark the straightforward uncached resolver first.
- Add only the smallest content-addressed cache and affected-consumer dependency
  index needed to demonstrate warm resolution and change impact.
- Benchmark cold resolution, warm resolution and one-entry invalidation without
  assuming a sophisticated cache is necessary.

Workstream D — developer and public experience:

- Add CLI commands or experimental subcommands for `publish`, `compose` and
  `verify` only where they expose the proof cleanly.
- Add a site example showing company + legal + product + repository becoming two
  different consumer views.
- Keep technical detail behind progressive disclosure.
- Keep the ordinary owner workflow to: propose → review the exact wording →
  approve → publish.
- Label all output advisory and the matrix feature experimental.

Parallelisation rule:

- Workstreams A, B and C may run in parallel only after Phase 1 schemas and
  fixtures are frozen for the iteration.
- Workstream D may begin with a static storyboard, but final copy and behaviour
  wait for executable proof output.
- One orchestrator owns integration, contract changes and final verification.

Gate:

- All twelve definition-of-done checks that do not require the internal pilot
  pass in CI.
- A missing legal or security overlay cannot produce a successful context.
- Adding a draft produces zero affected published consumers.
- One changed approved entry reports exactly the consumers it affects.

Estimated effort: 2–3 weeks after Phase 1.

### Phase 3 — Run the v0.6B internal evidence pilot

**Purpose:** Test value and maintainability inside the small organisation before
building enterprise infrastructure.

Scope:

- Choose one meaning-dense capability, with architecture review as the default.
- Author 20–50 entries that pass the admission test.
- Use real accountable roles and a documented owner-of-last-resort.
- Select 10–20 repeatable work tasks with observable outcomes.

Experiments:

1. Baseline: perform tasks without ORG.md context.
2. Advisory: repeat with bounded resolved context.
3. Maintenance: observe owner response time, stale entries and draft age.
4. Drift: change one source fact and run the complete lifecycle.
5. Context-size: compare full visible context with a bounded task manifest.

Measure:

- task success and material errors;
- number of entries actually relied upon;
- context size and delivery latency;
- approval turnaround and orphan rate;
- stale and pending duration;
- authoring effort and synced-to-native ratio;
- resolver cold/warm latency and change fan-out.

Gate:

- Continue if advisory context materially improves the selected tasks without
  requiring an impractical volume of authored meaning.
- Narrow ORG.md to a small authoring/interchange format if maintenance or context
  volume overwhelms the benefit.
- Reframe it as a policy integration project if only enforced gates improve
  behaviour.

Estimated elapsed time: 2–4 weeks to gather meaningful operational evidence.

### Phase 4 — Operational hardening, only after the pilot gate

**Purpose:** Replace proof components with integrations organisations already
trust.

Priority order:

1. Real IdP-backed role and clearance provider.
2. Production signing and key rotation through existing KMS/TUF/Sigstore
   primitives.
3. Append-only audit events linking proposal, approval, publication, resolution,
   delivery and action outcome.
4. Subscription delivery, acknowledgement and withdrawal of advisory context.
5. Resource envelopes, incremental indexes, observability and SLOs.
6. OPA/Cedar integration profile for contextual policy decisions.
7. Effective dates, forward rollback and short-lived audited break-glass flows.
8. Desk Lite only for the proven owner jobs: review a change, approve it, see
   impact and resolve health findings.

Gate:

- Do not call a target enforced until an unavoidable enforcement point applies
  every declared action.
- Do not call the system enterprise-ready until approval evidence, audit,
  recovery, resource limits and SLOs have been exercised together.

### Phase 5 — Global-scale federation research

**Purpose:** Test, rather than assume, that the model can cross legal and trust
domains.

Research items:

- independent registry and signing roots per legal or security domain;
- explicit trust bridges and cross-domain composition receipts;
- jurisdiction and applicability overlays;
- language variants and signed translation-equivalence review;
- regional artifact distribution and data-residency boundaries;
- continuity during registry, identity-provider or metadata outages;
- load tests for millions of consumers and high change fan-out.

Gate:

- Global-scale work remains experimental until two independent trust domains can
  compose context without sharing root keys or silently inventing precedence.

## 6. Work deliberately deferred

Do not begin these during the scale proof:

- a Git fork;
- a general-purpose knowledge base or ontology;
- a broad hosted platform;
- a full enterprise dashboard;
- custom identity, key-management, policy-engine or log-storage infrastructure;
- automatic AI approval;
- arbitrary task retrieval without mandatory-policy closure;
- global federation before the three-repository proof works.

Desk should remain a thin interface over proven workflows. It must not become the
architecture.

## 7. Linear execution structure

Create a dedicated Linear project named:

> **ORG.md — Matrix Composition & Ratification Proof**

This keeps the work isolated from other projects already using the workspace.
Do not reopen or repurpose completed project issues. Link prior work such as the
public-site simplification for provenance only.

Suggested milestones:

1. **M0 — Truth and contradictions**
2. **M1 — Protocol contracts accepted**
3. **M2 — Executable matrix proof**
4. **M3 — Internal evidence pilot**
5. **M4 — Evidence review and go/narrow/stop decision**

Issue groups:

- `SPEC` — normative RFCs and decision records
- `CONF` — schemas and conformance vectors
- `IMPL` — publication, attestation, composition and resolver work
- `PERF` — limits, caching, dependency analysis and benchmark
- `PILOT` — internal bundle, tasks, measurements and drift exercise
- `SITE` — claims, executable example and evidence publication
- `OPS` — identity, audit, delivery and later hardening

Linear safety rules:

- Resolve the exact team and project ID before creating issues.
- Prefix project-specific issue titles with `ORG.md:` if the team is shared.
- Never apply workspace-wide labels or modify unrelated projects.
- Give every issue a milestone, owner, dependencies and a testable acceptance
  statement.
- Keep Phase 4 and Phase 5 issues in backlog until their preceding gate passes.
- Use one parent issue per phase and bounded child issues suitable for parallel
  agents.

### M0 publication record

Publish M0 as completed evidence, not as a new backlog of work. Assign every
issue to Matt Wood, attach it to the M0 milestone and set it to the team's
completed state. The parent is complete only when all four child records exist.

1. **ORG.md: Complete M0 truth and contradictions** (`SPEC`, parent)
   - Depends on: all four child records.
   - Acceptance: Phase 0 has a committed RFC, decision record, aligned schema
     and conformance evidence, corrected governance examples, bounded public
     claims and a passing final verification record.
2. **ORG.md: Reconcile multi-revision identity in the standard** (`SPEC`/`CONF`)
   - Depends on: none.
   - Acceptance: the specification, schema and conformance corpus agree that an
     entry ID identifies a logical entry, `(id, rev)` identifies one revision,
     revisions sort numerically and revision numbers are positive safe integers.
3. **ORG.md: Correct lifecycle governance examples** (`SPEC`)
   - Depends on: the multi-revision identity record.
   - Acceptance: governance examples use entry lifecycle state separately from
     revision status and preserve the last approved revision while a challenge
     is recorded.
4. **ORG.md: Bound public scale and access claims** (`SITE`)
   - Depends on: none.
   - Acceptance: the public site describes large-organisation support as design
     intent, distinguishes a selected advisory view from access control and
     names the proof's current approval, federation, enforcement and performance
     limits in ordinary language.
5. **ORG.md: Verify and pin Phase 0 evidence** (`CONF`)
   - Depends on: the other three child records.
   - Acceptance: tests, type checking, build, dogfood validation, package smoke
     testing and desktop/mobile visual review pass; the public demo is pinned to
     an immutable implementation commit and matching digest.

## 8. Agent execution model

Once the plan is approved, use parallel agents with non-overlapping ownership:

- **Specification agent:** RFCs, normative consistency and decision records.
- **Protocol implementation agent:** publication, attestation and composition.
- **Conformance/performance agent:** fixtures, failure vectors, resource budgets
  and benchmarks.
- **Site and pilot agent:** public explanation, executable demonstration and
  internal pilot materials.
- **Primary orchestrator:** Linear, contract arbitration, integration, security
  review, final tests, visual QA and release decisions.

Every agent must work from the accepted schemas and fixtures. Contract changes
return to the orchestrator rather than being made independently in implementation
branches.

## 9. Release and review gates

At the end of each phase, record one of three decisions:

- **Go:** evidence supports the next phase.
- **Narrow:** preserve the useful subset and change the claim.
- **Stop:** archive the experiment with findings.

The primary risks to watch are:

- composition becoming too complex for ordinary owners;
- approval ceremony outweighing the value of the meaning being governed;
- context volume growing faster than task usefulness;
- an enterprise control-plane product emerging before the format proves value;
- public language getting ahead of executable evidence.

## 10. Immediate next action

Begin Phase 0 only:

1. Create the dedicated Linear project and M0 issues.
2. Draft the multi-revision identifier RFC and conformance vector.
3. Correct governance lifecycle examples.
4. Tighten the three public-site scale statements.
5. Run the full test suite and visual review.
6. Stop for review before opening the Phase 1 RFC pack.

### Phase 0 review record — 2026-09-02

- **Complete:** RFC 0016 and DEC-0023 make logical-entry and revision identity
  consistent across the specification, schema and reference behaviour.
- **Complete:** Core conformance corpus 0.1.1 covers numeric revision ordering,
  same-ID histories, duplicate pairs, zero and above-safe-integer revisions.
- **Complete:** governance examples use entry lifecycle state rather than invalid
  revision statuses.
- **Complete:** the public site describes large-organisation support as design
  intent, uses plain language for composition and access boundaries, and names
  the current proof's limits.
- **Complete:** 353 tests, type checking, build, dogfood validation, doctor,
  package smoke test, diff checks and desktop/mobile visual review pass.
- **Pending explicit authority:** publish the repository-derived project and M0
  issue content to Linear. Local implementation does not imply permission to
  transmit it to an external workspace.
- **Pending a real Phase 0 commit:** repin the public demo to that commit and its
  implementation digest, regenerate `site/playground/results.json`, then rerun
  `npm run site:playground:check`. The existing result remains unchanged and
  truthfully pinned to `6e1978f`; do not associate the new digest with that old
  commit.

**Gate decision:** Conditional Go. Do not open the Phase 1 RFC pack until both
pending items above are resolved and the final review records Go.
