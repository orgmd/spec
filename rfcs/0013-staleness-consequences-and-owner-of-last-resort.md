# RFC 0013 — Staleness consequences and the owner of last resort

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#13

## Motivation

Two failures, one root: the lifecycle has no consequences and no fallback.

**Staleness is decorative.** `revisit` is SHOULD (§4). Staleness is
computed (§4.1) and tooling "flags" it (§10). Nothing in §5, §6 or §6.3
changes because an entry is stale. So a policy entry whose `revisit` date
passed eight months ago still resolves, still projects, and still makes
`org.policy(action)` return `allow` — stamped with a current bundle
version and the ids relied upon, which is precisely the presentation of
confidence the standard exists to make honest. Hypothesis C in the roadmap
says flagged drift may rot at the same rate as stale wiki content. As
written, the spec guarantees it: a flag with no consequence is a wiki.

**Owner departure deadlocks ratification.** §4 requires exactly one owner.
§9 says only the accountable human owner may ratify to `approved`. Nothing
says what happens when that human leaves. Every entry they owned is now
unratifiable: the entries continue to resolve indefinitely, they cannot be
updated, they cannot be superseded, and they cannot even be marked
contested by anyone with authority to resolve the dispute. §10 lists
"entries whose `owner` no longer exists" as a thing to flag, which again
is a flag with no consequence.

This project's own bundle already avoids the second failure: every entry in
`org/` is owned by `role.editor`, not by a person. The spec should require
what it practises.

## Design

### Part 1 — `revisit` becomes mandatory where it matters

- `revisit` MUST be present on every **constraint** entry (policies) and
  on every entry in the `decisions` domain.
- `revisit` SHOULD be present on ordinary definitions.
- Bundle validation MUST fail where a constraint or decision entry has no
  `revisit`. Resolvers MUST NOT resolve such an entry and MUST record a
  `validation.missing-revisit` diagnostic. A constraint nobody has agreed
  to look at again is not a constraint; it is a sentence.
- Organisations SHOULD set `revisit` from the entry's rate of change, not
  from a uniform default. Tooling SHOULD propose a date and MUST NOT set
  one without an owner ratifying it.

### Part 2 — staleness has consequences

An entry is **stale** when any of the following holds at resolution time:

1. `revisit` is in the past;
2. its `owner` cannot be resolved to a current holder (§Part 3);
3. its `source` is `synced:` and the upstream reference has moved or
   stopped resolving.

Staleness is computed at resolution, never authored (§4.1, DEC-0005,
unchanged).

Normative consequences:

- Resolvers MUST mark stale entries in the effective context, with the
  reason.
- Compilers MUST mark stale entries visibly in **every** projection,
  advisory and enforced alike, in the same way contested entries are
  marked (§6.1). A projection that hides staleness misrepresents the
  bundle.
- Agents MUST treat a stale constraint or decision as they treat a
  contested one (§4.1): no autonomous action that depends on it; escalate
  to the entry's owner.
- At the gate (§6.3): where any policy entry matching the action is stale,
  `org.policy(action)` MUST NOT return `allow`. It MUST return `escalate`,
  routed to the stale entry's owner. A stale entry whose verdict would be
  `deny` MUST still return `deny` — staleness may only make the answer
  more conservative, never less. `org.define`, `org.decision` and
  `org.who_owns` MUST include the stale marker and reason in their
  responses.
- Ratifying a new `revisit` date is a change to meaning: only the entry's
  owner may do it, as a ratified revision, and re-confirmation MUST be
  recorded rather than applied in place.

**Grace period.** An organisation MAY declare a grace window in its root
`org.md`. Where declared, an entry within `revisit + grace` resolves
normally and MUST still be marked stale in every projection; past the
window the gate consequences above apply. The window MUST NOT exceed 90
days, and there is no grace for stale-by-orphaned-owner or
stale-by-upstream-drift. Where no window is declared, consequences apply
from the `revisit` date.

### Part 3 — owners, roles, and the owner of last resort

- `owner` MUST name exactly one accountable party. Principle 4 is
  unchanged.
- `owner` SHOULD be a **role** identifier (e.g. `role.editor`,
  `role.head-of-claims`) rather than a named individual. A role is one
  accountable party; the set of humans who hold it may change without the
  entry changing.
- At Core, a role resolves through the `ownership` domain of the resolved
  bundle. At Extended, roles MUST resolve to the organisation's identity
  system (§4.2), never to a parallel list of people in the bundle. This
  project defines no identity system (NON-GOALS 5).
- A role is **empty** when it resolves to no current holder. An entry
  whose owner is an empty role, or a named individual who no longer exists
  in the identity system, is **orphaned**, and orphaned entries are stale.

**Owner of last resort.**

- Every bundle MUST be able to name an owner of last resort. The **root**
  bundle MUST declare one, as an ownership entry with `id:
  own.last-resort`. Non-root bundles MAY declare one for their subtree.
- Where a bundle declares no owner of last resort, its owner of last
  resort is that of the nearest ancestor bundle that declares one.
  Resolution therefore always terminates at the root.
- `own.last-resort` is an authority definition and resolves under the
  anchoring rules of RFC 0011: a closer bundle MUST NOT shadow an
  ancestor's owner of last resort without delegation recorded in the
  anchoring bundle.
- Where an entry is orphaned, accountability for it escalates to the
  nearest declared owner of last resort on the path. That party MAY ratify
  changes to the entry, including reassigning its `owner`, and MUST be the
  escalation target returned by `org.who_owns` for that entry. This is the
  only path by which someone other than the named owner ratifies, and it
  opens only when the named owner cannot be resolved.
- Escalation to an owner of last resort MUST be recorded in the ratifying
  revision, so an audit shows the entry was ratified under fallback and
  not by its stated owner.

**§9 replacement sentence.** "Only the accountable human `owner` may
ratify a change to `approved`" becomes:

> Only a human who currently holds the entry's `owner` role may ratify a
> change to `approved`. Where the entry is orphaned, only a human holding
> the resolved owner of last resort may ratify, and the ratification MUST
> record that it was made under fallback. Tooling MUST NOT auto-merge
> changes to meaning, and holding a role is not itself ratification.

## Alternatives considered

**Do nothing.** Rejected on both halves. An expired policy that still
answers `allow` is the standard shipping a wrong answer with a version
stamp on it; an orphaned entry that nobody can ratify is a bundle that
decays into unmaintainable history the first time somebody resigns.

**Stale entries stop resolving entirely.** Rejected. A missed date would
silently remove a constraint, which widens what agents may do — the exact
direction principle 5 forbids. Escalate is the conservative failure;
disappear is not.

**Stale entries return `deny`.** Rejected. Blanket denial on a date makes
the standard operationally hostile and teaches organisations to set
`revisit` to 2099. `escalate` routes a human to the decision, which is the
behaviour the standard wants anyway.

**Keep `revisit` as SHOULD, strengthen only the tooling.** Rejected. This
is what the spec does today. Hypothesis C is the project's own statement
that surfacing without consequence may not be enough; a standard whose
correctness depends on a dashboard being read is not a standard.

**Allow multiple owners per entry so departure cannot orphan it.**
Rejected: violates principle 4, and disputes lose their route. Roles give
the same continuity while keeping one accountable party.

**Escalate orphaned entries to a maintainers group rather than a declared
owner of last resort.** Rejected: it invents an implicit group with no
declared accountability. Making the fallback an explicit, ownable entry
keeps it diffable and disputable like everything else.

**No grace period at all.** Considered and nearly taken. Retained as an
optional, bounded, still-marked window because the first adoption of this
rule against an existing bundle will otherwise expire a large batch of
entries at once, and organisations will respond by setting distant dates.

## Conformance impact

**Core.** `revisit` validation, staleness computation, and stale marking
in advisory projections are Core. Roles resolved through the bundle's
ownership domain are Core. The root bundle's `own.last-resort` entry is
one small file addition — the afternoon path holds.

**Extended.** Gate consequences (§6.3 escalate-on-stale, stale markers in
all four tools) and role resolution through the identity system.

**Full.** Orphan detection via HR/IdP sync (already listed in §10),
fallback-ratification records, and the contested/stale workflow.

New bench tasks (resolver suite):

- `stale.revisit-missing-01` — a policy entry with no `revisit` MUST fail
  validation and MUST NOT resolve.
- `stale.marked-in-projection-01` — an expired entry MUST be marked in the
  AGENTS.md fragment, the prompt block, and the handbook projection.
- `stale.grace-window-01` — with a declared 30-day window, an entry 10 days
  past `revisit` resolves normally and is marked; at 40 days the gate
  consequences apply.
- `owner.orphaned-01` — an entry owned by an empty role MUST resolve as
  stale, and `org.who_owns` MUST return the resolved owner of last resort.
- `owner.last-resort-inherit-01` — a bundle with no declared owner of last
  resort MUST resolve the nearest ancestor's.
- `owner.last-resort-shadow-02` — a leaf bundle publishing
  `own.last-resort` without delegation MUST be discarded per RFC 0011.

New bench tasks (agent and gate suites):

- `gate.stale-policy-escalate-01` — a policy matching the action expired
  eight months ago; `org.policy(action)` MUST return `escalate` with the
  owner route, never `allow`.
- `gate.stale-policy-deny-02` — a stale policy whose verdict is `deny`
  MUST still return `deny`.
- `agent.stale-decision-01` — the agent MUST NOT act autonomously on a
  stale decision and MUST escalate.
- `ratify.fallback-record-01` — ratification of an orphaned entry by the
  owner of last resort MUST be recorded as a fallback ratification.

## Constitution check

**Principle 4 (every entry has exactly one owner).** Preserved
deliberately. A role is one accountable party; several humans may hold it,
and the entry still routes disputes to one place. The owner of last resort
is a fallback for an unresolvable owner, not a second owner.

**Principle 8 (unknown authority escalates; it never assumes).** This RFC
extends it from unknown authority to unknown currency: an entry whose
meaning may have expired is treated as unknown, and escalates.

**Principle 5 (closer scopes narrow, never widen).** Honoured by the
escalate-not-disappear choice, and by resolving `own.last-resort` under
RFC 0011's anchoring rules.

**Principle 9 (agents propose; humans ratify).** Preserved. Fallback
ratification is still a human act, still recorded.

**Principle 3 (disagreement is representable).** Stale handling is
modelled on contested handling, so the two behave alike for consumers.

Not a constitutional amendment. DEC-0005 (staleness is computed, never
authored) is reaffirmed, not changed: this RFC adds consequences to the
computed value without introducing an authored `stale` status.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0020.md` (dec.0020). Normative text landed in SPEC.md
0.3-draft via PR #16.
