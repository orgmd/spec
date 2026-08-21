# RFC 0007 — Resolution-failure semantics

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#8

## Motivation

SPEC §5 step 4 says a resolver "MUST refuse to resolve a widening". Nothing in
the specification says what the consumer receives when it refuses. That leaves
three questions unanswered, each of which decides a security outcome:

1. **What does the consumer get?** An error object, an empty context, a
   partial context with the offending entry omitted, or the last successful
   result? A resolver that returns a partial context has silently dropped a
   constraint — the same hidden-deny failure as issue #3, reached by a
   different route.
2. **What does a gate answer while resolution is failing?** If it answers
   `escalate` because the action looks uncovered, an attacker who can induce a
   resolution failure has converted `deny` into a human prompt. If it answers
   `allow`, the failure is a bypass.
3. **How far does the failure spread?** A single malformed entry that fails
   the whole tree is a denial-of-service against every consumer of the
   organisation; a failure confined to nothing at all is not a refusal.

Resolution failure is not an edge case. It is the state the system is in when
someone is attacking it, and it is currently undefined.

## Design

### 1. Resolution errors

A **resolution error** is a condition that prevents the resolver computing a
well-defined result for some part of the tree. Resolvers MUST treat at least
the following as resolution errors:

| Code | Condition | Blast radius |
|---|---|---|
| `widening` | A closer constraint fails the narrowing test (RFC 0006) | entry `id` |
| `duplicate_id` | Two entries share an `id` within one bundle | entry `id` |
| `invalid_entry` | Missing required §4 field, unknown `status`, invalid `effect`, `escalate` without `route` | entry `id` |
| `invalid_action` | `action` value does not match the RFC 0005 grammar | entry `id` |
| `unresolvable_route` | `route` names no identifier in the ownership domain | entry `id` |
| `kind_mismatch` | The same `id` appears as a definition in one bundle and a constraint in another | entry `id` |
| `unparseable_bundle` | A bundle file cannot be parsed | bundle |
| `integrity_failure` | `org.lock` verification fails (§7) | bundle |
| `unreachable_node` | A node on the requested path cannot be loaded | request |

Implementations MAY define further codes. They MUST NOT downgrade any of the
above to a warning.

### 2. Blast radius

Failure MUST be scoped to the smallest unit that contains the defect.

- **Entry-scoped errors** MUST affect only the offending `id`. Every other
  entry in the tree MUST resolve normally. A resolver MUST NOT fail the
  bundle, the node, or the request because one `id` is defective.
- **Bundle-scoped errors** affect every entry originating in that bundle. The
  rest of the path MUST resolve normally, and every `id` the failed bundle
  contributed to MUST be marked in error. Integrity failure is bundle-scoped
  by §7's existing rule that a failing bundle MUST NOT be loaded; fall-back to
  last known-good (§7) applies before this RFC's handling, and this RFC
  governs only what happens when no known-good version is available.
- **Request-scoped errors** produce no effective context at all.

### 3. No partial effective context for a failed id

For any `id` in error, the resolver MUST NOT emit that entry, MUST NOT emit
any ancestor or descendant version of it as though it were the resolved
answer, and MUST NOT merge parts of the contributing entries. A failed `id`
resolves to an error, never to content.

This is the important half of the rule. Falling back to the ancestor version
when a closer version fails is the tempting behaviour and it is wrong: it
presents a rule the closer node has visibly tried to change as if the change
did not exist, which is silent shadowing (issue #3) reached from the failure
path.

### 4. Error reporting in effective context

Effective context MUST carry a `resolution_errors` list. Each element MUST
carry at least:

- `id` — the affected entry `id`, or the affected bundle identifier for
  bundle-scoped errors
- `code` — from §1 above
- `node` — the node at which the defect was detected
- `detail` — a human-readable message

Resolution errors are part of the resolver's deterministic output: two
conforming resolvers given the same tree, identity and clearance MUST produce
the same `resolution_errors` list, in the same order. Implementations MUST
order the list by (`node`, `id`, `code`), all compared as byte strings.

Resolution errors MUST NOT be filtered by clearance out of existence. Where
the affected `id` is above the consumer's clearance, the resolver MUST report
the error with the `id` withheld per RFC 0008, retaining `code`. A consumer
must be able to learn that something is broken above it without learning what.

### 5. Gate behaviour: failed resolution is `deny`

Where an input action matches, or would match, any constraint entry whose `id`
is in error, `org.policy` MUST return `verdict: deny` with
`reason: resolution_error`. It MUST NOT return `allow`, and MUST NOT return
`escalate`.

The choice of `deny` over `escalate` is deliberate and is the one place this
RFC departs from the intuition of constitution principle 8. Principle 8
governs *unknown* authority: nobody has spoken, so ask. A resolution error is
not silence — it is a bundle in a state a resolver refused to accept, and the
commonest cause of the flagship case (`widening`) is a closer bundle
attempting to loosen an inherited rule. Answering `escalate` would hand an
attacker a way to convert a standing `deny` into a human decision made under
time pressure, which is a well-worn social-engineering path. `deny` fails
closed and is unambiguous.

"Would match" is load-bearing: a resolver MUST evaluate matching against the
*declared* action of entries in error even though their content is not
resolved, so that an entry cannot be removed from the decision set by being
made invalid. Where the error prevents the action value itself being read
(`invalid_action`, `unparseable_bundle`), the affected scope is treated as
matching every action from the erring bundle's node downward, and the gate
MUST return `deny` for actions at or below that node.

`org.define`, `org.decision` and `org.who_owns` MUST return a structured miss
with `reason: resolution_error` for an affected `id` (RFC 0005 §6). They MUST
NOT fall back to an ancestor value.

### 6. Advisory compiler behaviour: fail the build, keep the projection

Where any resolution error affects entries a compiler would emit, the compiler
MUST:

- exit non-zero;
- report every resolution error in its output;
- leave the previously generated projection **unchanged** on disk.

It MUST NOT emit a projection with the affected entries omitted, and MUST NOT
emit an empty or truncated projection. A stale but complete AGENTS.md section
is safer than a fresh one missing a constraint, and the CI failure is what
tells a human the difference. Compilers MUST NOT offer a flag that emits a
projection over unresolved errors; a `--force` on this path is a hidden-deny
generator.

### 7. Audit and drift

Serving implementations at Full conformance MUST emit an audit event per
resolution error under the `org.context.*` namespace (§8), carrying `code`,
`id`, `node`, requesting identity and bundle versions. Repeated
`widening` errors from the same node SHOULD be surfaced by drift tooling
(§10) as either an authoring problem or a probe; the distinction is a human's
to make, and they cannot make it without the events.

## Alternatives considered

**Do nothing.** Rejected: "MUST refuse to resolve" with no defined consumer
outcome means each implementation picks its own failure mode, and the safe and
unsafe choices are equally conformant.

**Fail the whole tree on any error.** Rejected: an organisation-wide outage
triggered by one malformed front-matter block, and an obvious denial-of-service
primitive for anyone who can land a commit in any bundle.

**Omit the failed entry and resolve the rest silently.** Rejected: this is
hidden-deny by another name. It is also the behaviour a naive implementation
falls into, which is why this RFC prohibits it explicitly rather than leaving
it unmentioned.

**Fall back to the last-known-good version of the failing entry.** Rejected
for entry-scoped errors: it silently reinstates meaning a node has visibly
tried to change, and it makes the gate's answer depend on resolution history
rather than on (bundle versions, identity, action), breaking §6.3
determinism. Retained only where §7 already defines it — signed bundles with a
TTL'd known-good version — because there the fall-back target is itself
versioned and reported.

**Return `escalate` on resolution error.** Rejected, per §5 above: it converts
a broken bundle into a prompt, and prompts under pressure are approved.

## Conformance impact

**Core.** Resolution errors, blast radius, the no-partial rule, the
`resolution_errors` output and compiler behaviour (§6) are Core: they belong
to §5 and §6.2.

**Extended.** Gate behaviour (§5 of this RFC) attaches to §6.3.

**Full.** Audit events (§7 of this RFC) attach to §8, and the drift signal to
§10.

**Bench tests to add:**

- `fail/blast-radius-entry` (resolver) — one invalid entry; every other `id`
  resolves normally and the error is reported.
- `fail/no-ancestor-fallback` (resolver) — closer entry in error; the ancestor
  version is not emitted in its place.
- `fail/deterministic-error-list` (resolver) — two implementations, identical
  `resolution_errors`, identical order.
- `fail/gate-denies` (agent + resolver) — action matching an erring `id`
  returns `deny` with `reason: resolution_error`.
- `fail/invalid-action-denies-subtree` (resolver) — unreadable action value
  denies at and below the erring node.
- `fail/compiler-keeps-projection` (resolver) — non-zero exit and the previous
  projection byte-identical on disk afterwards.
- `fail/error-visible-above-clearance` (resolver) — low-clearance consumer
  receives the error with the `id` withheld, not an absent error.

## Constitution check

No amendment required.

- **Principle 5** is served: the no-partial and no-fall-back rules close the
  paths by which a failure could effectively widen a constraint.
- **Principle 8** is engaged and honoured with a stated scope boundary:
  unknown authority escalates; *refused* authority denies. This RFC states the
  distinction rather than quietly making an exception, and the wording of
  §4.1/§6.3 should adopt it.
- **Principle 2** (generated projections are never canonical) supports keeping
  the previous projection on failure: it is a stale artefact, not a stale
  truth, and the canonical bundle is unaffected.
- **Principle 10**: failure behaviour is behavioural and therefore benched.
- **DEC-0007 / NON-GOALS #9**: no relations between entries are introduced.
  Errors are attributes of a single `id`.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0014.md` (dec.0014). Normative text landed in SPEC.md
0.3-draft via PR #16.
