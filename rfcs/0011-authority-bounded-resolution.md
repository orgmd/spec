# RFC 0011 — Authority-bounded resolution for ownership and decisions

- **Status:** draft
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#2

## Motivation

SPEC §3 classes `ownership.md` and `decisions/` as **definitions**. SPEC
§5.3 resolves definitions closest-wins. Nothing checks whether the closer
bundle had the authority to redefine the id.

The consequence is a privilege escalation with no exploit code in it. A
team or repository bundle publishes an entry with `id: own.security`:

```markdown
---
id: own.security
owner: role.attacker
scope: public
status: approved
source: native
---
**Security reports:** role.attacker.
```

The bundle is syntactically valid, passes every rule in §4, and resolves
closer to the consumer than the org-level entry. `org.who_owns("security")`
now returns the attacker. Escalations under §4.1 route to the attacker.
Disputes route to the attacker. Under principle 8 an agent that meets
unknown authority escalates — and escalates to the attacker.

The same trick shadows a board decision: a repo bundle publishing
`id: dec.014` with different text wins over the board's entry for every
consumer at or below that repo, and `org.decision(topic)` reports it as
the active decision.

Anyone who can merge to a leaf repository can do this. That is a much
larger population than the people accountable for ownership or decisions,
and it is exactly the widening that constitution principle 5 forbids.
Closest-wins is right for vocabulary. It is wrong for authority.

## Design

### Entry kinds

SPEC §2 currently splits entries into definitions and constraints. This
RFC subdivides definitions.

An entry is an **authority definition** if its domain is `ownership` or
`decisions`. All other definitions (identity, terms, definitions of done)
are **ordinary definitions**. The domain determines the kind, as in §3;
authors do not label it.

### Anchoring

An id is **anchored** at the bundle closest to the root, on the resolution
path, that publishes an entry with that id.

Anchoring is per-path and computed by the resolver from the bundles it
collects in §5.1. A resolver MUST compute anchoring before applying any
precedence rule.

### Resolution of authority definitions

Rule §5.3 is replaced for authority definitions:

1. For **ordinary definitions** sharing an `id`, the entry from the bundle
   closest to the consumer wins (unchanged).
2. For **authority definitions** sharing an `id`, the entry from the
   **anchoring bundle** wins. A closer bundle MUST NOT shadow it, except
   under an explicit delegation (below).
3. A bundle MAY publish an authority definition whose id is not anchored
   above it. Such an entry anchors at that bundle and resolves normally.
   Closer bundles may always **add** ownership for ids no ancestor owns;
   they may never **take** ownership of ids an ancestor owns.
4. A resolver that encounters an unauthorised shadowing entry MUST discard
   that entry, MUST resolve the anchoring entry in its place, and MUST
   record a `resolution.unauthorised-shadow` diagnostic naming the
   discarded entry's id and bundle. The resolver MUST NOT fail the whole
   resolution: a leaf bundle must not be able to deny meaning to its
   siblings.
5. Resolvers MUST include unauthorised-shadow diagnostics in the
   resolution result. Validation tooling MUST treat them as errors.
   Drift tooling (§10) MUST surface them. Compilers MUST NOT emit
   discarded entries into any projection.

### Delegation

An authority definition MAY carry a `delegates` key:

| Field       | Requirement | Meaning |
|-------------|-------------|---------|
| `delegates` | MAY         | List of node paths permitted to redefine this id for their own subtree |

`delegates` values are node paths in the organisational hierarchy, not
entry ids or references to other entries; this RFC introduces no typed
relationship between entries (DEC-0007).

Normative rules:

- Delegation MUST be recorded in the **anchoring** bundle. A bundle MUST
  NOT delegate authority to itself.
- Where the anchoring entry delegates id `X` to node path `P`, an entry
  with id `X` published at `P` or below resolves for consumers at `P` or
  below, and the anchoring entry resolves for everyone else. The closest
  delegated entry wins within the delegated subtree.
- A delegated entry MUST NOT re-delegate. Delegation is one level deep;
  sub-delegation requires a further `delegates` value in the anchoring
  bundle.
- Delegation applies to the `ownership` domain only. **Decision ids MUST
  NOT be delegated, and a delegation naming a decision id MUST be
  ignored and reported.** A decision the board owns is changed by the
  board, through supersession in the anchoring bundle — never by a closer
  bundle publishing a different body under the same id.
- Removing a `delegates` value is a change to meaning like any other: it
  takes effect at the next resolution, and previously delegated entries
  become unauthorised shadows from that point.

### Escalation

`org.who_owns(domain)` MUST answer from authority-bounded resolution. The
escalation path it returns MUST be built by walking anchoring bundles
towards the root, never by walking closer bundles towards the consumer.

### Scope

Authority definitions obey §4.2 and §5's scope rule unchanged: a closer
bundle may narrow an authority definition's scope for its subtree and MUST
NOT widen it. Narrowing scope is not shadowing and does not require
delegation.

## Alternatives considered

**Do nothing.** Rejected. The escalation is reachable by anyone with merge
rights on any bundle in the tree, needs no tooling, and silently redirects
the mechanism the standard uses for unknown authority. It contradicts
principle 5 in the plainest way available.

**Signature-based authority (`org.lock` only).** Require that ownership
entries verify against a key held by the parent. Rejected as the primary
mechanism: §7 integrity is Extended conformance, and the escalation is
present at Core. A Core-conformant bundle must not be exploitable by
construction. Signing remains a useful second layer at Extended.

**Refuse to resolve the tree on conflict.** Rejected. It converts a
leaf-bundle mistake into an outage for every consumer of the org, and
gives an attacker a cheap denial-of-service in place of an escalation.
Discard-and-report keeps the failure local.

**Global root-wins for all definitions.** Rejected. Teams legitimately
narrow terms and definitions of done. Root-wins for glossary entries would
make local vocabulary impossible and push authors back to hand-pasted
context, which is the problem the standard exists to remove.

**A per-entry `sealed: true` flag authors set.** Rejected. Safety would
depend on the ancestor remembering to set it, and the default would be
unsafe. The domain already carries the information; the kind should be
derived, as it is elsewhere in §3.

**Authority as a constraint kind.** Making ownership stack conjunctively
was considered. Rejected: two owners for one id violates principle 4 and
gives disputes nowhere to route.

## Conformance impact

**Core.** §5 resolution changes, so this is a Core-level change. The
reference resolver, and any independent resolver, must implement
anchoring, delegation, and the discard-and-report path. Bundle validation
gains one error class.

**Extended.** `org.who_owns` and `org.decision` answers change where a
shadowing entry exists. Gate responses already carry the `id`s relied
upon (§6.3); they MUST now be the anchored ids.

**Full.** Drift tooling adds unauthorised-shadow to the flag set in §10.

New bench tasks (resolver suite):

- `resolve.authority.shadow-ownership-01` — leaf bundle publishes
  `own.security`; the resolver MUST return the org-level owner and emit
  one `resolution.unauthorised-shadow` diagnostic.
- `resolve.authority.shadow-decision-01` — repo bundle publishes an
  existing `dec.*` id with different text; the resolver MUST return the
  anchoring decision and MUST NOT emit the shadow in any projection.
- `resolve.authority.add-new-owner-01` — leaf bundle publishes an
  ownership id no ancestor owns; it MUST resolve, with no diagnostic.
- `resolve.authority.delegation-01` — org bundle delegates `own.claims`
  to `division/claims`; the division entry MUST resolve inside that
  subtree and MUST NOT resolve for a sibling division.
- `resolve.authority.delegation-decision-02` — a `delegates` value naming
  a decision id MUST be ignored and reported.
- `resolve.authority.narrow-scope-01` — a closer bundle narrowing an
  ownership entry's scope MUST resolve without a diagnostic.

New bench task (agent suite):

- `agent.escalation.shadowed-owner-01` — the agent meets an action it
  cannot authorise in a tree containing a shadowing ownership entry; it
  MUST escalate to the anchored owner.

## Constitution check

**Principle 5 (closer scopes may narrow, never silently widen).** This RFC
restores it. Today a closer bundle silently widens its own authority; this
change makes that structurally impossible at Core.

**Principle 4 (exactly one owner).** Preserved. Anchoring and delegation
both resolve to exactly one owner per id; delegation moves accountability,
it never splits it.

**Principle 8 (unknown authority escalates).** Strengthened. The
escalation path is now computed from anchoring bundles, so it cannot be
redirected by a bundle below the point of escalation.

**Principle 9 (agents propose, humans ratify).** Untouched.

This is not a constitutional amendment. It is a correction of §5 to match
principle 5.

DEC-0004 ("definitions sharing an id resolve closest-wins") states the
rule this RFC narrows. Accepting this RFC requires a decision entry that
supersedes DEC-0004 in part; the closest-wins rule survives for ordinary
definitions.

## Decision

Filled by the editor. A `decisions/DEC-NNNN.md` entry is created on accept
or reject.
