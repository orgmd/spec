# RFC 0010 — Scoped contested propagation and attributable contesting

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#12

## Motivation

SPEC §4.1 says agents "MUST NOT take autonomous action that depends on a
contested policy or decision". SPEC §5 step 5 says: "if any entry contributing
to the effective context is contested, its contested handling applies."

The two sentences do not agree, and the second admits a reading in which any
contested entry anywhere on the path blocks all autonomous action for every
consumer resolving through that path. Under that reading, marking one glossary
term `contested` at the org node halts every agent in the organisation. That
is an organisation-wide denial of service reachable by a single front-matter
edit.

Nothing in the specification restricts who may make that edit. `status` is a
plain field; §9's ratification rule governs the transition *to* `approved` and
says nothing about the transition to `contested`. Any contributor with write
access to any bundle — or any agent authoring a `draft`, or an adapter syncing
from a compromised upstream — can set it. The state that exists to represent
honest disagreement is also, as specified, an unauthenticated kill switch.

Constitution principle 3 requires that disagreement be representable. It does
not require that disagreement be contagious.

## Design

### 1. Reliance

Define **reliance**: a consumer relies on an entry for a given action or read
when that entry's `id` appears in the `relied_upon` set of the verdict
(RFC 0005 §4) or is the entry returned by a definition-domain read
(`org.define`, `org.decision`, `org.who_owns`).

Reliance is computed by the resolver, not asserted by the consumer.

### 2. Narrow propagation

SPEC §5 step 5 is replaced. Contested status MUST propagate by reliance only:

- An agent MUST NOT take autonomous action that relies on a contested entry.
  It MUST escalate to that entry's `owner`.
- A contested entry that the action does not rely on MUST NOT block the
  action, MUST NOT change its verdict, and MUST NOT be reported as bearing on
  it.
- Contested entries MUST still be marked visibly wherever they are emitted
  (§6.1), whether or not the consumer relies on them. Marking is not
  propagation.

Resolvers MUST report, per response, which relied-upon entries are contested,
so a consumer can apply the rule without re-deriving reliance.

### 3. Gate behaviour

Where a contested constraint entry is in the relied-upon set for an action:

- If the effective verdict is `allow`, the gate MUST return `escalate`, with
  `reason: contested` and the contested entry's `route` — or, where the entry
  carries no `route`, its `owner` — as the escalation target.
- If the effective verdict is `escalate`, it remains `escalate`;
  `reason: contested` MUST be reported alongside.
- If the effective verdict is `deny`, it MUST remain `deny`. A dispute over a
  denial does not suspend the denial.

Contested status therefore never weakens a verdict and never strengthens one
past `deny`. It converts permission into a question and leaves prohibition
alone, which is the conservative treatment §4.1 asks for, applied to the one
entry actually at issue.

Where a contested entry matches the action but is *not* in the relied-upon set
— it was outranked on specificity within its bundle, or its bundle's local
verdict was not the effective one — the gate MUST NOT alter the verdict. It
MAY report the entry as contested-and-matching for the consumer's information.
An entry that does not decide the answer does not get to block it.

### 4. Definitions

`org.define`, `org.decision` and `org.who_owns` MUST return a contested entry
with a contested marker rather than withholding it: the meaning is disputed,
not absent. A consumer MUST NOT take autonomous action depending on a
contested definition and MUST escalate to its `owner`. Human-facing
projections MUST show the dispute (§6.1) and remain usable.

### 5. Who may contest, and how it is recorded

A transition from `approved` to `contested` is a governed act, not an edit.

- Only the entry's `owner`, or an identity on that entry's escalation path
  (the ownership domain, §3), MAY set an entry to `contested`. Implementations
  MUST reject the transition from any other identity.
- Any other identity — including any agent — MAY *request* that an entry be
  contested. The request routes to the entry's `owner` per §9's
  agents-propose/humans-ratify rule. An agent MUST NOT set `contested`
  directly; drafting a dispute is proposing meaning, and marking a live entry
  contested is ratifying a change to it.
- Every transition into or out of `contested` MUST be recorded per §8 with:
  the acting identity, timestamp, entry `id`, the bundle version before and
  after, and a `ref` to the dispute. A transition that cannot be attributed to
  an identity MUST be rejected, not recorded as anonymous.
- Transitions out of `contested` follow §9: only the accountable `owner` may
  return an entry to `approved`.
- A `synced:` entry MUST NOT be set `contested` in the bundle; the transition
  belongs in the system of record and arrives through the adapter (§4.3).

Two properties follow, and are the reason for the rule. First, contesting is
bounded: an identity can only disrupt what it is already accountable for.
Second, contesting is attributable: the denial-of-service reading of §5 step 5
is not merely narrowed, it is traceable to a person where it happens.

### 6. Drift signal

A high or growing count of contested entries, and contested entries that
remain contested past their `revisit` date, SHOULD be surfaced by drift
tooling (§10) as unresolved disagreement. Contested is a temporary state by
intent; an entry that has been contested for six months is not disputed, it is
abandoned, and the owner needs to hear that.

## Alternatives considered

**Do nothing.** Rejected: §4.1 and §5 step 5 disagree, the broad reading is an
organisation-wide DoS, and the authority to trigger it is unspecified.

**Keep broad propagation and restrict who may contest.** Rejected: it reduces
the population who can halt the organisation but leaves the halt itself
available and, worse, makes it a legitimate action. An owner disputing one
glossary term should not stop unrelated agents.

**Treat contested as `deny` at the gate.** Rejected: it makes contesting more
powerful than the rule being contested — a dispute over an `allow` would
produce a firmer answer than the settled `allow` ever was — and it converts
disagreement into a blunt outage rather than a routed decision. `escalate` puts
a human on it, which is what a dispute needs.

**Treat contested as `allow` with a warning.** Rejected: it contradicts §4.1
and constitution principle 8, and it makes the contested state cosmetic.

**Propagate contested to entries that reference the contested entry via
`ref:`.** Rejected: `ref:` points at rationale in a system of record, not at
meaning, and making it a propagation channel would give it relation semantics
it does not have (DEC-0007, NON-GOALS #9).

**Let a contested entry be contested only for the consumers it applies to,
computed per-identity.** Rejected as a redundant restatement: reliance is
already per-request, and reliance is computed after the clearance-independent
verdict (RFC 0008), so the answer does not vary by identity in a way that
could hide a dispute.

## Conformance impact

**Core.** §5 step 5 is replaced by reliance-scoped propagation; §4.1's
sentence is aligned with it. Resolvers must report contested status on
relied-upon entries.

**Extended.** Gate behaviour (§3 above) attaches to §6.3, and interacts with
RFC 0005's response shape: `reason` gains `contested`.

**Full.** §8 gains the contested-transition record; §11 already lists
"contested-workflow support" at Full, and this RFC defines what that workflow
must guarantee. The authority restriction in §5 above is enforceable only
where identity is available, so it is a MUST at Full and a SHOULD at Core and
Extended, where a bundle in a git repository must rely on review controls
(§7's reviewed-writes rule) instead.

**Bench tests to add:**

- `contested/unrelated-does-not-block` (agent + resolver) — a contested
  glossary term elsewhere on the path does not change an unrelated verdict.
- `contested/relied-upon-escalates` — an `allow` whose relied-upon entry is
  contested returns `escalate` with `reason: contested` and a route.
- `contested/deny-stays-deny` — a contested `deny` remains `deny`.
- `contested/matching-but-not-relied-upon` — a contested entry outranked
  within its bundle does not alter the verdict.
- `contested/definition-marked-not-withheld` — `org.define` returns the entry
  with a contested marker.
- `contested/transition-attributed` (Full) — an unattributed transition to
  `contested` is rejected.
- `contested/transition-authority` (Full) — a transition by an identity
  outside the owner and escalation path is rejected; the same act by the owner
  succeeds and is recorded.
- `contested/agent-cannot-contest` (agent track) — an agent's attempt to set
  `contested` produces a routed request, not a status change.

## Constitution check

No amendment required.

- **Principle 3** (organisational disagreement must be representable) is
  preserved and made usable: `contested` remains a real state and stops being
  an instrument that takes the organisation down with it.
- **Principle 4** (every entry has exactly one owner) supplies the authority
  rule in §5: the person accountable for the meaning is the person who may
  declare it disputed.
- **Principle 8** (unknown authority escalates): disputed authority now
  escalates too, along the entry's own route, rather than blocking globally or
  silently proceeding.
- **Principle 9** (agents propose, humans ratify) is extended to the
  `contested` transition, which it did not previously cover — an omission this
  RFC treats as a gap in §9 rather than a new principle.
- **DEC-0007 / NON-GOALS #9**: no typed relations. Reliance is a property of a
  single response computed by the resolver, not a stored relationship between
  entries, and it is explicitly not carried in the bundle.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0017.md` (dec.0017). Normative text landed in SPEC.md
0.3-draft via PR #16.
