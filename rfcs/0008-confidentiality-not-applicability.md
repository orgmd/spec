# RFC 0008 — Confidentiality is not applicability: clearance redacts, it does not remove

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#3

## Motivation

SPEC §5 orders resolution as: collect (step 1), **filter by clearance**
(step 2), then resolve definitions (step 3) and constraints (step 4). Filtering
before resolution conflates two unrelated questions — *does this rule apply to
this action?* and *may this identity read this rule?* — and produces two
failures, both of which favour the least-cleared consumer.

**Hidden deny.** A `restricted` constraint denies an action. An `internal`
consumer asks the gate. Step 2 removes the entry before step 4 sees it. No
entry matches, so §6.3's uncovered rule returns `escalate` — or, where a
`public` entry allows the same action, the gate returns `allow`. The most
sensitive policies in the bundle are the ones least able to bind. The system
is strictest for the most trusted identity and weakest for the least, which is
backwards.

**Silent shadowing.** A `public` definition at the org node is superseded by a
`restricted` one at the team node. Step 2 removes the closer entry; step 3
then finds the ancestor version and, per closest-wins, declares it canonical.
The consumer receives stale meaning presented as current, with no marker,
because from the resolver's post-filter view nothing was superseded. §4.2's
withheld-entry marker does not fire — and it is only a SHOULD in any case.

Both are correctness failures before they are confidentiality failures. A
policy applies to an action because of what the action is, not because of who
is asking.

## Design

### 1. Split the two concerns

SPEC §5's step order is replaced. Resolution MUST proceed:

1. Collect all entries from every bundle on the path, root to node.
2. Resolve definitions (closest-wins) and compute constraint verdicts
   (RFC 0005) over the **complete, unfiltered** entry set.
3. Apply the consuming identity's clearance to the **emission** of resolved
   results, per §3 and §4 below.
4. Emit, with bundle versions.

Clearance MUST NOT determine whether an entry participates in resolution.
Clearance determines only what the consumer is shown of the result.

### 2. The invariant

**Verdict invariance.** For a given (bundle versions, node, action), the
`verdict` returned by `org.policy` MUST be identical for every consuming
identity, regardless of clearance. Clearance MAY change the `relied_upon` set
as emitted, the routes, and any accompanying text. It MUST NOT change the
verdict.

This is the property the bench tests and the property implementations must be
able to state plainly to a security reviewer. It follows directly from the
split above and it is what makes hidden-deny unrepresentable rather than
merely discouraged.

A consequence worth stating: a `restricted` entry with `effect: allow` will
also permit a `public` consumer's action. That is correct. Confidentiality of
a rule's *text* is not a claim about who the rule *binds*. Where an
organisation wants a rule to apply only to some identities, that is a
different rule, not a scope label, and it belongs in the identity system the
scope resolves to (§4.2).

### 3. Constraints: redact the text, never the decision

A resolver MUST NOT remove a constraint entry from the decision set on
clearance grounds. Where a relied-upon constraint entry's `scope` is above the
consuming identity's clearance, the resolver MUST:

- include its contribution in the verdict;
- emit, in place of the entry, a **withheld marker** carrying at minimum
  `withheld: true` and `reason: clearance`;
- omit the entry's `id`, body, `ref`, `action` value and `owner` from the
  emitted result.

Where the verdict is `escalate` and every relied-upon entry is withheld, the
response MUST still carry a usable route. Implementations MUST route to the
nearest escalation target the consumer is cleared to see, and MUST mark the
route as substituted (`route_substituted: true`), so the consumer knows it is
being sent to a proxy rather than to the entry's own owner.

Withheld markers MUST have a shape that does not vary with the withheld
content: the same fields, in the same order, whatever the entry was. The
number of markers reveals how many entries were withheld; implementations
SHOULD report a count rather than repeated markers where a per-entry marker
would add nothing.

At Extended conformance, implementations MAY additionally emit a
deployment-stable pseudonymous handle for a withheld entry — for example an
HMAC of the `id` under a key held in the organisation's KMS (§7, NON-GOALS
#5) — so that audit and support can correlate a withheld verdict with an entry
without disclosing it. Where emitted, the handle MUST be stable across
identities and MUST NOT be derivable to the `id` by a consumer.

Advisory projections follow the same rule in the form available to them:
compilers MUST emit a withheld marker in place of a filtered constraint, and
MUST NOT emit a projection that reads as a complete set of constraints when it
is not. §4.2's "SHOULD emit a withheld-entry marker" becomes a MUST for
constraints.

### 4. Definitions: withhold whole, or mark the shadow

Where a definition entry that wins closest-wins resolution is above the
consuming identity's clearance, the resolver MUST take exactly one of two
behaviours, and the deployment MUST declare which:

- **Mode A — withhold the id.** `org.define` returns a structured miss with
  `reason: withheld` (RFC 0005 §6). No ancestor definition is emitted for that
  `id`. Compilers omit the entry and emit a withheld marker.
- **Mode B — marked shadow.** The nearest in-clearance ancestor version of the
  `id` is emitted, and MUST carry `superseded_by_withheld: true`. Consumers
  MUST treat a definition so marked as known-stale: agents MUST NOT take
  autonomous action that depends on it and MUST escalate to the entry's
  in-clearance escalation target.

Emitting an ancestor definition **without** the marker is prohibited. That is
silent shadowing and it is the defect this RFC exists to close. A resolver
that cannot determine whether a closer version was withheld MUST use Mode A.

The mode MUST be a deployment-wide setting, not per-identity and not
per-entry: a mode that varies gives an observer an oracle for which entries are
shadowed. Mode A is the RECOMMENDED default; Mode B exists for deployments
where an out-of-date public definition is more useful than none, and it is
honest only because of the marker.

The same rule applies to `org.decision` and `org.who_owns`, which are
definition-domain reads.

### 5. Relationship to resolution errors

Where an `id` is in error (RFC 0007), the error is reported to every consumer.
Where the `id` itself is above clearance, the error is reported with the `id`
withheld per §3. Clearance MUST NOT suppress the existence of a resolution
error.

## Alternatives considered

**Do nothing.** Rejected: the current step order produces a gate that is
weakest for the least-trusted consumer, and a definition read that presents
stale meaning as canonical. Both are exploitable without any special access —
the attacker simply asks with a low-clearance identity.

**Filter first, and forbid `restricted` constraints.** Rejected: it removes
the ability to express a confidential rule at all, which is a common and
legitimate need (an unannounced acquisition constraint, a regulator-imposed
restriction). It also cannot be enforced — nothing stops an organisation
labelling a constraint `restricted` — so it converts a correctness bug into a
policy nobody can check.

**Return a distinguished `withheld` verdict instead of the real one.**
Rejected: it breaks verdict invariance and hands the consumer a signal that a
sensitive rule matched their action, which leaks more than the redacted answer
does.

**Compute the verdict twice — once filtered, once not — and return the
stricter.** Rejected as needless: the unfiltered computation alone is already
the stricter of the two by construction, and running two evaluations doubles
the surface on which the two could diverge.

**Emit the real `id` of withheld entries so consumers can escalate
precisely.** Rejected at Core: `id`s in this format are meaningful strings
(`policy.acquisition-freeze`), so the identifier is often the disclosure. The
optional pseudonymous handle at Extended covers the operational need without
the leak.

**Leave the withheld marker a SHOULD.** Rejected: an optional marker means a
conformant implementation may present an incomplete constraint set as a
complete one, which is the silent-shadowing failure with permission.

## Conformance impact

**Core.** The step reordering, verdict invariance, redaction of constraints,
the MUST-level withheld marker, and Modes A/B for definitions are all Core:
they are §5 and §4.2 semantics, and they are simpler to implement than the
current ordering, not harder.

**Extended.** The pseudonymous withheld handle is optional at Extended, and
depends on the organisation's KMS.

**Documentation.** §4.2's third bullet changes from SHOULD to MUST for
constraints. SECURITY §2's summary of least privilege should say that scope
governs disclosure, not applicability.

**Bench tests to add:**

- `clearance/hidden-deny` (resolver + agent) — a `restricted` `deny` and a
  `public` `allow` match the same action; an `internal` consumer receives
  `deny` with a withheld marker. This is the flagship regression case.
- `clearance/verdict-invariance` — the same action asked at `public`,
  `internal` and `restricted` returns the identical verdict; only the
  emitted `relied_upon` differs.
- `clearance/silent-shadowing-mode-a` — a `restricted` closer definition over
  a `public` ancestor returns a `withheld` miss, not the ancestor.
- `clearance/silent-shadowing-mode-b` — the same tree in Mode B returns the
  ancestor with `superseded_by_withheld: true`; emitting it unmarked fails.
- `clearance/marker-shape-constant` — withheld markers for entries of
  differing size, owner and action are byte-identical.
- `clearance/withheld-escalate-route` — all relied-upon entries withheld;
  a substituted route is emitted and marked.
- `clearance/error-not-suppressed` — a resolution error on a `restricted`
  `id` is still reported to a `public` consumer.
- `clearance/advisory-marker` — a compiled AGENTS.md fragment carries a
  withheld marker where a constraint was filtered.

## Constitution check

No amendment required.

- **Principle 5** (narrow, never silently widen): this RFC closes a path by
  which filtering effectively widened a constraint for low-clearance
  identities. It strengthens the principle.
- **Principle 8** (unknown authority escalates): unchanged, and the
  hidden-deny fix stops a *known* authority being mistaken for an unknown one.
- **Principle 1** (humans and machines are first-class consumers) and
  **principle 2**: unaffected.
- **Principle 10**: verdict invariance is the benchable statement of this
  change.
- **DEC-0007 / NON-GOALS #9**: no typed relations introduced.
  `superseded_by_withheld` is a boolean attribute of the emitted result — it
  names no other entry, and it is a property of the projection rather than of
  the bundle. Supersession is already permitted by DEC-0007 in any case.
- **NON-GOALS #5** (no identity system of our own): preserved. Clearance still
  resolves to the organisation's IdP; this RFC changes only where in the
  pipeline the clearance is applied.

**Known limitation, to be recorded in SECURITY.md.** Withheld markers and
their counts are a low-bandwidth side channel: a consumer can learn that
sensitive meaning bears on its action, and roughly how much. This is the
deliberate trade against §4.2's stated goal that consumers "know meaning
exists above their clearance without learning it". The alternative — hiding
the marker — reintroduces hidden deny. The channel should be named in the
honest-limitations list rather than left implicit.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0015.md` (dec.0015). Normative text landed in SPEC.md
0.3-draft via PR #16.
