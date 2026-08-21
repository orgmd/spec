# RFC 0006 — Structural narrowing for constraints; removal of `narrows:`

- **Status:** draft
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#7
- **Depends on:** RFC 0005 (action/effect fields)

## Motivation

SPEC §5 step 4 says that where a closer bundle carries a constraint with the
same `id` as one above it, "the closer version MUST only narrow it; a resolver
MUST refuse to resolve a widening". Over prose bodies this is undecidable. No
resolver can determine whether one English paragraph narrows another, so the
sentence describes an obligation no implementation can discharge — and §5's
resolver-conformance guarantee then rests on it.

The reference implementation's workaround makes the problem worse.
AGENT-BRIEF step 2 defines narrowing as "the closer entry declares
`narrows: <parent id>` or is identical". That is:

1. **Self-certification by the less trusted party.** The closer bundle — the
   one further from the root, typically owned by the team whose scope the
   parent constraint exists to limit — asserts that it narrows, and the
   resolver believes it. A repo bundle can widen an org policy by adding one
   line of front-matter. This is the exact widening the security model (§5,
   SECURITY §2) claims to prevent.
2. **A typed relationship between entries.** `narrows:` is a named, directed
   relation with semantics attached. DEC-0007 and NON-GOALS #9 say entries
   relate only by `ref:` and supersession, and that adding relation types
   requires constitutional amendment. The reference implementation introduced
   one to work around a spec defect.

Once constraints carry `action` and `effect` (RFC 0005), narrowing is a
structural comparison of two small values and neither workaround is needed.

## Design

### 1. `narrows:` is removed

Implementations MUST NOT define, read or honour a `narrows:` field or any
other author-supplied assertion that one entry narrows another. Resolvers MUST
ignore such a field if present in a bundle, and validators SHOULD warn on it.
No claim by a bundle about its relationship to another bundle's entry may
affect resolution.

### 2. Where the security property actually comes from

The primary guarantee against widening is not the same-`id` check. It is stage
2 of the verdict computation (RFC 0005 §4): the effective verdict is the
strongest local verdict on the path, and specificity is never compared across
bundles. A closer bundle therefore cannot weaken an ancestor's constraint no
matter what it authors, whether the `id`s coincide or not, and whether or not
any narrowing check runs.

The same-`id` rule below is an **authoring integrity check**. It catches a
closer bundle that reuses an ancestor's `id` while meaning something looser —
which is an authoring error, or a probe, and either way must not resolve
silently. It is not the mechanism the security property depends on. Stating
this plainly matters: a reviewer auditing the resolver should be able to see
that removing the narrowing check would not open a widening path.

### 3. Structural narrowing

For constraint entries, define:

**Action-set containment.** For action values `C` (closer) and `Pn` (parent),
`C ⊆ Pn` holds when:

- `Pn` is an action token and `C` is the same token; or
- `Pn` is a pattern with literal prefix `p1..pn`, and `C` is a token with at
  least `n+1` segments whose first `n` segments equal `p1..pn`; or
- `Pn` is a pattern with literal prefix `p1..pn`, and `C` is a pattern with
  literal prefix `c1..cm` where `m ≥ n` and `c1..cn` equal `p1..pn`.

Containment is otherwise false. Under the RFC 0005 grammar this is a prefix
test on a segment list; it is decidable, total, and readable.

**Effect strength.** The total order `deny > escalate > allow`.

**Narrowing.** A closer constraint entry `C` narrows a parent constraint entry
`Pn` sharing its `id` when both hold:

1. `action(C) ⊆ action(Pn)`; and
2. `strength(effect(C)) ≥ strength(effect(Pn))`.

A closer entry that is byte-identical to the parent trivially narrows.

Where `effect(Pn)` is `escalate` and `effect(C)` is `escalate`, `route(C)` MAY
differ from `route(Pn)`: an escalation may be routed to a closer owner without
weakening the constraint. Where `effect(Pn)` is `escalate` and `effect(C)` is
`deny`, `route(C)` is not required.

### 4. Resolver obligations

- A resolver MUST evaluate the narrowing test for every pair of constraint
  entries sharing an `id` on the node path, taking as `Pn` the nearer of the
  two to the root.
- Where the test fails, the resolver MUST raise a resolution error for that
  `id`, with the handling and blast radius defined in RFC 0007. It MUST NOT
  silently drop either entry, MUST NOT prefer the parent, and MUST NOT emit a
  partially merged entry.
- A resolver MUST NOT reject a bundle merely because a closer constraint has
  an `id` an ancestor does not use. Distinct `id`s stack, per §5 step 4, and
  are combined by the verdict rules.

### 5. Guidance for authors

Reusing an ancestor's `id` is a claim of continuity: this is the same rule,
tightened here. Authors who want a different rule SHOULD give it a different
`id` and let it stack. Tooling SHOULD say so in the error text when a
narrowing check fails, because the fix is nearly always "rename it", not
"argue with the resolver".

## Alternatives considered

**Do nothing.** Keep the prose requirement and the `narrows:` workaround.
Rejected: the requirement is undecidable, the workaround inverts the trust
direction, and the workaround violates DEC-0007.

**Keep `narrows:` but require the parent bundle to counter-sign it.**
Rejected. It is still a typed relation (DEC-0007), and it introduces a
cross-bundle signing ceremony for a check that structural comparison performs
for free.

**The interim rule proposed on the issue: stack both entries and let the
stricter effect win, dropping the narrowing check entirely.** This is safe and
is in fact what stage 2 already does; RFC 0005 makes it the general rule for
all constraints. It is not adopted as the *whole* answer because it makes
same-`id` reuse silently meaningless: a closer entry that intended to replace
an ancestor rule but widened it would resolve without complaint and the author
would never learn. The structural check costs one prefix comparison and turns
that silence into an error.

**Natural-language entailment checking of bodies (model-assisted narrowing).**
Rejected outright. It is non-deterministic, it makes the resolver — the
trusted base — depend on a model, and it contradicts AGENT-BRIEF's zero-
inference rule and §5's byte-identical-output property.

**Treat any same-`id` collision on constraints as an error.** Rejected: it
removes a legitimate and common pattern (a division tightening an org policy
under the same handle, so audit can follow one rule down the tree).

## Conformance impact

**Core.** Resolvers at Core perform the narrowing check, because Core includes
§5. The check is a prefix comparison and two enum lookups.

**Extended and above.** Unchanged beyond the above.

**Tooling.** AGENT-BRIEF step 2's parenthetical simplification and the `not`/
`narrows` entries in `schema/entry.schema.json` must be removed. The
"issues opened for every simplification" checklist item for narrowing
semantics is closed by this RFC.

**Bench tests to add** (resolver track):

- `narrow/identical` — byte-identical closer entry resolves.
- `narrow/action-subset` — closer `billing.refund` under parent `billing.*`,
  same effect, resolves.
- `narrow/effect-stronger` — closer `deny` under parent `escalate`, same
  action, resolves.
- `narrow/widen-action` — closer `billing.*` under parent `billing.refund`
  raises a resolution error scoped to that `id`.
- `narrow/widen-effect` — closer `allow` under parent `deny` raises a
  resolution error scoped to that `id`.
- `narrow/self-certification-ignored` — a closer entry declaring
  `narrows: <parent id>` while widening still raises the error. This is the
  regression test for the trust inversion.
- `narrow/distinct-ids-stack` — a closer entry with a different `id` and a
  looser effect does not error and does not weaken the verdict.

## Constitution check

No amendment required. This RFC moves the repository *back* into conformance
with two existing decisions.

- **Principle 5** (narrow, never silently widen) is realised structurally
  instead of asserted in prose, and the trust inversion introduced by
  `narrows:` is removed.
- **DEC-0007 / NON-GOALS #9** (no typed relationships): this RFC deletes a
  typed relation rather than adding one. The narrowing test compares two
  entries that already share an `id`; identity is not a relation type, it is
  the same handle appearing twice, which §5 step 3 and step 4 already rely on
  for definitions and constraints alike. No entry references another entry.
- **Principle 10** (behavioural conformance): the check is decidable, so it
  is testable.
- **Principle 6** (borrow, never rebuild) is not engaged; nothing is invented
  here beyond a prefix comparison.

## Decision

Filled by the editor.
