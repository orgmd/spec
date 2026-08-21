# ORG.md Specification

**Version:** 0.2-draft
**Status:** Draft — open for comment via RFC (see GOVERNANCE.md)
**Editor:** Matt (BoundFor Ltd)
**License:** CC BY 4.0 (this document); reference implementations Apache-2.0
**Last updated:** August 2026
**Changed in 0.2:** inheritance replaced by resolution (§5); definition vs
constraint semantics; status model reworked (`draft` added, staleness is
computed, never authored); agents-propose / humans-ratify made normative
(§9); maintenance and drift added (§10); resolver conformance added (§11);
integrity profiled on TUF/Sigstore (§7); MADR alignment (§4.4); OTel
namespace (§8).

ORG.md is an open standard for the **organisational meaning layer**: a
small, versioned bundle recording what an organisation means — its
vocabulary, policies, decisions, ownership, and definitions of done —
resolved by scope and projected to every audience, human and agent, at the
least privilege required.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be
interpreted as described in RFC 2119.

---

## 1. Purpose and scope

Repo-level agent context (AGENTS.md) and agent protocols (MCP, A2A) are
standardised. The layer above them is not: every agent surface currently
receives its own hand-pasted, drifting copy of what the organisation
means. ORG.md defines one canonical source for that meaning and the rules
for resolving and projecting it safely.

The relationship to adjacent layers, in one line each: **ORG.md anchors
meaning. Skills define how work is done. Tools provide capability. Agents
act.** Anything that does not require shared organisational meaning stays
outside this standard (see NON-GOALS.md, normative by reference).

## 2. Terminology

- **Bundle** — a directory tree conforming to §3, attached to a node in
  the organisational hierarchy (board, org, division, team, repository).
- **Entry** — one unit of meaning with the fields in §4. Every entry is
  either a **definition** (states what something is: terms, identity,
  ownership, decisions, definitions of done) or a **constraint** (limits
  action: policies). The domain determines the kind (§3).
- **Resolver** — the component that computes **effective context**: the
  set of entries that apply to a given consumer, after scope filtering
  and the rules in §5. Consumers never traverse the tree themselves.
- **Projection** — a generated, never canonical, rendering of effective
  context for a target (AGENTS.md fragment, prompt block, MCP gate,
  handbook).
- **Consumer** — any human or agent identity that receives a projection.
- **Gate** — an enforcing projection: a tool interface whose responses
  are deterministic (§6.3).

## 3. Bundle layout

The normative unit is the **semantic domain**, not the filename. The
layout below is RECOMMENDED; implementations MUST map files to domains
and MUST ignore unknown files and front-matter keys.

```
org/
├── org.md          # REQUIRED — identity, mission, tone      (definition)
├── glossary.md     # terms, one entry each                   (definition)
├── decisions/      # active decisions, one file per decision (definition)
├── policies.md     # what agents may / must not do           (constraint)
├── ownership.md    # who decides what; escalation map        (definition)
├── done.md         # definitions of done; eval criteria      (definition)
└── org.lock        # signed manifest (Extended conformance)
```

`org.md` is the only REQUIRED file. A bundle containing only `org.md` and
one meaning file is valid. All content files are Markdown with YAML
front-matter, readable by a human with no tooling.

## 4. Entry model

Every entry MUST carry:

| Field     | Requirement | Meaning |
|-----------|-------------|---------|
| `id`      | MUST        | Stable identifier, unique within the tree (e.g. `term.consignment`, `policy.P-03`, `dec.014`) |
| `owner`   | MUST        | Exactly one accountable owner (role or identity). Disputes route here. |
| `scope`   | MUST        | Access label. Defaults: `public`, `internal`, `restricted`. Organisations MAY define more (§4.2). |
| `status`  | MUST        | `draft` \| `approved` \| `contested` \| `superseded` |
| `source`  | MUST        | `native` or `synced:<system>` (§4.3) |
| `revisit` | SHOULD      | Date after which the entry is treated as stale unless re-confirmed |
| `ref`     | MAY         | Link to fuller material in a system of record (rationale, minutes, standards) |

There is **no confidence field**. Uncertainty is expressed through
`draft` and `contested`; a stored confidence number invites consumers to
threshold on it, which is neither enforceable nor auditable.

### 4.1 Status semantics

- `draft` — proposed meaning, not yet ratified. Compilers MUST NOT emit
  drafts into consumer projections except explicitly-requested preview
  targets.
- `approved` — ratified by the entry's owner; consumers use it normally.
- `contested` — under dispute. Consumers MUST treat contested meaning
  conservatively: agents MUST NOT take autonomous action that depends on
  a contested policy or decision and MUST escalate to the entry's
  `owner`. Compilers MUST mark contested entries visibly in every
  projection.
- `superseded` — retained for history; compilers MUST NOT emit
  superseded entries except in audit views.

**Staleness is computed, never authored.** An entry past its `revisit`
date, orphaned by an owner change, or whose `synced:` source has moved is
stale; tooling derives this and flags it (§10). There is no `stale`
status a human can set, because such a status would itself go stale.

### 4.2 Scope semantics

- Scope labels are access classes. At Core conformance the resolver
  honours them; at Extended conformance they MUST resolve to the
  organisation's identity system (IdP groups or claims), never to a
  parallel access list in the bundle.
- Every projection MUST be filtered by the consuming identity's clearance
  before emission. There is no conformant way to emit an unfiltered
  bundle to a consumer.
- Resolvers SHOULD emit a withheld-entry marker where content was
  filtered, so consumers know meaning exists above their clearance
  without learning it.

### 4.3 Source semantics — canonical by exception

- `synced:<system>` — the system of record is elsewhere; an adapter
  maintains the entry. Implementations MUST NOT accept manual edits to
  synced entries except through the upstream system.
- `native` — no system of record exists; the bundle is canonical for
  this entry.
- Bundles are intended to be mostly synced. ORG.md is an interchange
  format, not a new place to write. Tooling SHOULD surface the
  synced-to-native ratio as a health signal.

### 4.4 Decision and policy entries

Decision files SHOULD follow existing ADR/MADR conventions where they
apply — the format thousands of engineers already know. A decision
records what is now true and who owns it; rationale beyond what a
consumer needs to act belongs in the organisation's own systems via
`ref:` (§9). A policy entry MUST be expressible as a decision function
over an action — `allow`, `escalate` (with a route), or `deny`; guidance
that cannot be expressed this way belongs in `org.md` tone or the
handbook, not `policies.md`.

## 5. Resolution

Consumers do not read bundles; they receive **effective context**. A
consumer (or the tooling acting for it) asks the resolver: *what applies
to this identity, at this node, at this clearance?*

Given the node path (e.g. board → org → division → team → repo), the
resolver MUST:

1. Collect all entries from every bundle on the path, root to node.
2. Filter by the consumer's clearance (§4.2).
3. For **definitions** sharing an `id`: the entry from the bundle
   closest to the consumer wins.
4. For **constraints**: all applicable entries apply **conjunctively** —
   they stack. Where a closer bundle carries a constraint with the same
   `id` as one above it, the closer version MUST only narrow it; a
   resolver MUST refuse to resolve a widening.
5. Propagate `contested`: if any entry contributing to the effective
   context is contested, its contested handling (§4.1) applies.
6. Emit the effective context with the bundle versions it was resolved
   from.

Scopes obey the same direction of travel: a closer bundle MAY narrow an
entry's scope and MUST NOT widen it.

**The resolver is part of the trusted base.** Every security property of
this standard depends on resolver correctness, so resolvers are
first-class subjects of conformance (§11): two conforming resolvers given
the same tree, identity, and clearance MUST produce the same effective
context.

### 5.1 Worked example

Org policy: *customer information may be used for approved business
purposes only.* Division constraint: *claims workloads run in NZ-hosted
environments.* Repo constraint: *this agent accesses anonymised claims
data only.* The effective context for that repo's agent is all three,
conjoined. The agent never sees the tree; it sees the resolved result.

## 6. Projections

### 6.1 General rules

Compilers MUST: (1) project from resolved effective context, never raw
bundles; (2) preserve meaning — projections re-express, never
re-interpret; (3) mark every projection with the bundle versions it was
resolved from; (4) mark contested entries visibly; (5) label each target
**advisory** or **enforced**. Projections are generated artefacts and are
never canonical.

### 6.2 Advisory targets

AGENTS.md fragments, CLAUDE.md fragments, prompt blocks, skill context,
and human handbooks are **advisory**: they inform and cannot bind.
Documentation MUST NOT claim policy is "enforced" where only advisory
targets are deployed. Projections emitted into repositories (e.g. an
AGENTS.md section) MUST be delimited as generated content that tooling
refreshes and humans do not hand-edit.

### 6.3 Enforced target — the gate

The gate is an MCP server exposing, at minimum:

```
org.define(term)        → canonical definition (resolved, scope-filtered)
org.policy(action)      → allow | escalate | deny
org.decision(topic)     → active decisions + owner (resolved, scope-filtered)
org.who_owns(domain)    → owner + escalation path
```

`org.policy` responses MUST be deterministic for a given (bundle
versions, identity, action). An action not covered by any policy entry
MUST return `escalate`, never `allow`. Gate responses MUST include the
bundle versions and the `id`s relied upon.

## 7. Integrity (Extended conformance)

`org.lock` is a manifest of entry hashes, the bundle version, and a
signature. Implementations SHOULD realise it as a profile of TUF (The
Update Framework), whose delegation, revocation and rollback semantics
are mature and audited, and MAY use Sigstore for keyless signing bound to
OIDC identity. Keys MUST be held in the organisation's existing key
management; this specification defines no key infrastructure of its
own. Consumers
SHOULD verify before loading and MUST NOT load a bundle that fails
verification. Trust carries a TTL; implementations MUST support
revocation, with fall-back to the last known-good version at next TTL
expiry. Bundles MUST change only through reviewed writes; direct writes
to a served bundle are a conformance failure at Extended level.

## 8. Audit (Full conformance)

Serving implementations MUST record consumption events: identity, bundle
versions, scope, timestamp. Events SHOULD be emitted as
OpenTelemetry-compatible events under an `org.context.*` semantic
convention namespace, to the organisation's existing monitoring.
This specification defines no log store.

## 9. Write-doctrine (normative)

**Admission test.** An entry belongs only if a consumer acting on the
wrong version of it is expensive — in money, material risk, or meaningful
confusion. If nothing breaks when it is wrong, it MUST NOT be added.

**Never-write list.** Bundles MUST NOT contain: secrets or credentials;
personal data about individuals; personnel judgments; commercial
rationale beyond what consumers need to act (use `ref:`); speculative
strategy. Organisations SHOULD extend this list in their own `org.md`.

**Agents propose; humans ratify.** AI systems MAY draft entries, detect
gaps, and propose updates (entering as `draft`). Only the accountable
human `owner` may ratify a change to `approved`. Tooling MUST NOT
auto-merge changes to meaning. This is the standard's definition of
AI-native authoring: machines are first-class participants in proposing
meaning and never in ratifying it.

## 10. Maintenance and drift

Organisations change continuously, so this standard treats **drift** as a
first-class concern rather than relying on people remembering to edit.

Implementations SHOULD detect and flag at least: entries past `revisit`;
entries whose `owner` no longer exists (e.g. via HR/IdP sync); `synced:`
entries whose upstream changed or disappeared; and repeated agent
escalations on the same ambiguity, which indicate *missing* meaning.

The intended lifecycle: reality changes → drift detected → update
proposed (often by tooling, as `draft`) → owner ratifies → conformance
tests run → projections regenerate → consumers receive new meaning at
their next resolution.

## 11. Conformance levels

| Level | Requirements |
|---|---|
| **Core** | §3–§6.2: bundle layout, entry model, resolution, scope-filtered advisory projections. Achievable by a small org in an afternoon. |
| **Extended** | Core + §6.3 gate + §7 integrity, with scopes resolved to the organisation's identity system. |
| **Full** | Extended + §8 audit + §10 drift tooling + contested-workflow support. |

Conformance is **behavioural**: it means passing the published
conformance suite (the Org Context Bench harness) for the claimed level,
not agreeing with this prose. The suite covers **agents** (does the
consumer apply resolved meaning correctly?) and **resolvers** (do
independent implementations produce identical effective context?). Where
suite and prose conflict, file the issue; an RFC resolves it.

## 12. Versioning

This specification uses semantic versioning; everything before 1.0.0 may
change via RFC. At 1.0.0 the formats and semantics in §3–§6 freeze;
additions come as optional capabilities. Bundles version through
`org.lock`; projections carry the versions they were resolved from.

---

## Appendix A — minimal conformant bundle

```
org/
├── org.md          (identity: Kōwhai Freight Ltd; tone: plain, direct)
└── glossary.md     (one entry: term.consignment)
```

This two-file bundle is Core-conformant. Everything else in this
specification is what it can grow into.
