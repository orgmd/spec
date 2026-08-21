# Triage of the August 2026 independent review

**Status:** working document — findings verified against `SPEC.md` 0.3-draft,
`README.md`, `ROADMAP.md`, and `site/index.html` at the commit this file
lands on. Each finding from the independent review was checked against the
actual text before being accepted.

## Verdict summary

| Finding | Verdict | Notes |
|---|---|---|
| BLOCKER 1 — status conflates ratification and lifecycle | **Confirmed** | Real contradiction; resurrection hazard is real |
| BLOCKER 2 — content ID misses resolution-affecting root metadata | **Confirmed — worse than stated** | The scope lattice escapes the *context identifier* too, not just the bundle content ID |
| BLOCKER 3 — policy grammar vs product copy | **Partially confirmed** | The site example is actually representable (it escalates); the boundary is unstated, not violated |
| HIGH 4 — Mode A/B vs byte-identical conformance | **Confirmed** | Mode is a deployment setting but not a conformance input |
| HIGH 5 — compiler byte-identical conformance | **Confirmed** | §11.4 requires bytes no canonical target profile defines |
| HIGH 6 — Core role binding | **Confirmed** | §9 Core role resolution is circular |
| HIGH 7 — raw bundle access | **Confirmed** | No storage invariant anywhere in SPEC or SECURITY |
| §5 repo drift items | **Confirmed** | ROADMAP still says "0.2-draft published"; README still says "the test suite *is* the standard" |

## Detail per finding

### BLOCKER 1 — confirmed

§2 and §4.7 define the effective revision as "the highest `rev` with
status `approved`". §4.7's state table then defines **contested** as "the
effective revision is `contested`" and **retired** as "the effective
revision is `superseded`" — but a revision whose status is `contested` or
`superseded` is by definition not `approved`, so it cannot be the
effective revision under the selection rule. The two definitions cannot
both hold.

The resurrection hazard is real: flip an approved rev 4 to `contested`
and the selection rule silently elects approved rev 3 — raising a dispute
reverts meaning. The same mechanism fires for `superseded`: retiring
rev 4 resurrects rev 3 instead of retiring the entry, directly
contradicting "the entry no longer resolves".

The review's Option A (separate `ratification` from `state`) is the right
fix and matches the spec's own "staleness is computed, never authored"
doctrine: lifecycle state is already mostly computed; ratification is the
only authored bit. Touches §2, §4.1, §4.7, §5 step 1, §6.3, §7.2
("`org.lock` MUST cover only revisions with status `approved`"), and the
worked examples in §3.2 / Appendix A.

### BLOCKER 2 — confirmed, and broader than the review states

§7.1's entry canonical form has a closed member list; `scopes:` (declared
on the identity entry per §4.2) and `bundle` (§4.5) are unknown keys for
canonicalisation purposes and are explicitly excluded ("Unknown
front-matter keys MUST NOT be included in the canonical form"). So editing
the scope lattice — which changes narrowing legality (§4.2), emission
(§5.4), and withheld-marker behaviour — leaves the bundle content
identifier unchanged.

Worse: §5.5's context identifier hashes only (path, bundle-version) pairs
+ clearance labels + spec version. Since the lattice reaches the bundle
version through nothing, the *context identifier* is also unchanged —
violating §5.5's own normative claim that it "changes whenever any input
to resolution changes". Caches keyed on the context identifier will serve
stale resolutions across a lattice change.

Fix: define a canonical bundle-level metadata object (bundle id, scopes
lattice, grace window from §4.8 — audit for any other root-level
resolution input) and fold it into the §7.1 digest input; add the
review's proposed conformance vector (change only the lattice, assert the
content ID changes). Note the grace window (§4.8) is a third
resolution-affecting root value the review did not list.

### BLOCKER 3 — partially confirmed; the fix is a statement, not a redesign

The site's refund example (`site/index.html`, "The rule" scenario) is in
fact representable: `policy.P-07` carries `action:
payments.refund.issue`, effect `escalate`, and the NZ$500 threshold lives
in the prose body, with the human on the route applying it. That is
legal under §4.4 ("the body explains the rule to a human, the fields
decide it") — every refund escalates, finance applies the threshold.

What's missing is the explicit boundary statement. A reader can
reasonably believe ORG.md evaluates `amount > 500`; it does not and
cannot. Adopt the review's Option A wording in §4.6 ("ORG.md policy
actions are already-classified organisational actions; ORG.md does not
classify raw business events") and add one sentence to the site scenario
saying the gate escalates every issue and the threshold is applied by the
human (or by pre-classifying `payments.refund.issue.high-value`). No
grammar change needed for 0.3.1.

### HIGH 4 — confirmed

§5.4 makes Mode A / Mode B a mandatory deployment-wide declaration, but
§5's conformance sentence and §11.3 fix the inputs as "tree, identity and
clearance" — the mode is not among them, so two conforming resolvers with
different declared modes legally emit different bytes for identical
conformance inputs. Cheapest fix consistent with keeping Mode B: add the
disclosure mode to the conformance input tuple (§5, §5.5, §11.3).
Cleaner fix, per the review: Mode A only at Core, Mode B to Extended.
Either resolves the contradiction; Mode A-only is recommended since Mode
B already carries a known-stale/escalate burden that makes it near-useless
to consumers anyway.

### HIGH 5 — confirmed

§11.4 requires "byte-identical projection output for identical resolved
input" but §6 defines no canonical rendering for any advisory target.
Adopt canonical target profiles (versioned template identifiers, e.g.
`orgmd/agents-fragment-v1`) for machine-oriented targets; human handbook
targets validate semantically per §6.1 rather than byte-wise.

### HIGH 6 — confirmed

§9: "At Core a role resolves through the `ownership` domain of the
resolved bundle" — the bundle can say `role.editor` owns the entry, but
nothing at Core binds a human identity to `role.editor`, so "only a human
currently holding the owner role may ratify" is unverifiable at Core. The
review's second formulation is right and one sentence: Core validates
organisational semantics; identity-backed proof that the ratifier holds
the role is an Extended guarantee via the IdP mapping (§4.2). Do not add
role-binding data to Core bundles.

### HIGH 7 — confirmed

No storage invariant exists in SPEC.md or SECURITY.md. Meanwhile
README.md and the site standfirst both claim ORG.md "controls who sees
what" — but anyone with git read access to a bundle mixing `public` and
`restricted` entries reads everything raw. Add the review's deployment
invariant (raw-bundle access MUST be at least as restrictive as the most
restricted entry stored in it) to §4.2 or SECURITY.md, and soften the
copy per the review.

## Repo drift — confirmed

- `ROADMAP.md` v0.4 still lists "SPEC.md 0.2-draft published" as an
  unchecked future item; the spec is 0.3-draft and the site is live.
- `README.md` prior-art section still says "The test suite *is* the
  standard, per JSON Schema", superseded by SPEC §11 ("Where the suite is
  silent, the normative prose of this specification governs").
- README opening ("ORG.md keeps it current, controls who sees what, and
  delivers the right version … automatically") and the site standfirst
  attribute tooling/deployment behaviour to the standard — exactly the
  §6.4-style overclaim the spec itself prohibits for enforcement.
- §11's Core row says "Achievable by a small org in an afternoon"
  attached to a list of resolver obligations (§5.2 anchoring, §5.3 blast
  radius, §5.4 withheld markers, §7.1 JCS hashing). Adoption-with-tooling
  in an afternoon is credible; implementation is not. Reword to separate
  the two claims.

## Positions taken on the review's judgement calls

- **Option A for policy conditions** — agreed (see BLOCKER 3): no
  condition language in 0.3.1.
- **Mode A as Core** — agreed.
- **Ratification/state split** — agreed, Option A (two fields), because
  it aligns with the computed-state doctrine already in §4.7.
- **Reclassify hardening as experimental** — agreed in spirit; §7.2–§7.6
  are already Extended-only, which is most of the way there. Marking
  §7.2–§7.6 "Experimental" pending a second implementation costs one
  status line and buys honest sequencing.
- **Authority migration (§3.1 of the review)** — track as an issue; do
  not spec before the MVE.

## Recommended 0.3.1 work order

1. BLOCKER 1 — ratification/state split (largest diff, touches most
   sections; do first while the surface is small).
2. BLOCKER 2 — bundle-level metadata in the content identifier + vector.
3. HIGH 4 — disclosure mode: Mode A Core, Mode B Extended.
4. HIGH 6 — one-paragraph Core/Extended role-binding clarification.
5. HIGH 7 — raw-storage invariant + copy softening.
6. BLOCKER 3 — boundary statement in §4.6 + site scenario sentence.
7. HIGH 5 — canonical target profiles (can trail; no compiler exists yet
   to be non-conformant).
8. Drift pass — ROADMAP checkboxes, README prior-art and opening copy,
   "afternoon" claim.

Items 1–6 are spec-text only and carry no new concepts, consistent with
the review's "correctness and clarity release" framing.
