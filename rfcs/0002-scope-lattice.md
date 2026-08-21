# RFC 0002 — Scope ordering: a declared lattice

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#9

## Motivation

SPEC §5 requires scopes to narrow:

> Scopes obey the same direction of travel: a closer bundle MAY narrow an
> entry's scope and MUST NOT widen it.

Nothing in the specification says which scope is narrower than which. The
ordering `public < internal < restricted` appears only in AGENT-BRIEF.md
§2, which is a build brief, not normative text. A resolver cannot decide
whether `internal → restricted` narrows or widens by reading SPEC.md.

§4 also permits org-defined labels:

> Organisations MAY define more (§4.2).

Real org-defined labels are compartments, not levels: `hr-only` and
`finance-only` are mutually incomparable. "Narrower" is undefined between
them, so a bundle narrowing `internal → hr-only` and a sibling narrowing
`internal → finance-only` are both accepted or both refused depending on
the implementation's guess. §11's guarantee — two conforming resolvers,
same tree, same identity, same output — fails on the first bundle that
uses a fourth label.

The same gap hits filtering. §4.2 requires every projection to be
"filtered by the consuming identity's clearance" without saying what it
means for a clearance to cover a scope.

## Design

Replace SPEC §4.2 in full with the following.

### 4.2 Scope semantics

Scope labels are access classes. Every entry carries exactly one.

**The scope order.** Scope labels are partially ordered by the relation
**narrower-than-or-equal**, written `⊑`. `a ⊑ b` means the audience of `a`
is contained in the audience of `b`. The relation MUST be reflexive,
transitive and antisymmetric — a partial order, not necessarily a total
one.

The three default labels are totally ordered:

```
restricted ⊑ internal ⊑ public
```

Resolvers MUST implement these three and this order. A bundle that uses
only default labels needs no scope declaration.

**Org-defined labels.** An organisation MAY define further labels. Each
one MUST be declared in the root bundle's `org.md`, in a `scopes:`
mapping on the identity entry, giving the labels it is narrower than:

```yaml
scopes:
  hr-only:      { narrower_than: [internal] }
  finance-only: { narrower_than: [internal] }
  hr-exec:      { narrower_than: [hr-only] }
```

- The declared order is the reflexive-transitive closure of the
  `narrower_than` edges, together with the default order.
- The closure MUST be acyclic. A cycle is a validation error.
- Every label named in `narrower_than` MUST itself be a default label or
  a declared label.
- Labels declared in a non-root bundle MUST be ignored, and the resolver
  MUST report them. Scope vocabulary is organisation-wide by definition.
- An entry whose `scope` is neither a default label nor a declared label
  is a **resolution error**: the resolver MUST refuse to resolve and MUST
  NOT fall back to a default. An unknown access class is unknown
  authority.

**Narrowing.** Where a closer bundle carries an entry with the same `id`
and a different `scope`, the closer scope `s'` MUST satisfy `s' ⊑ s`. Two
incomparable labels do not narrow: `hr-only ⊑ finance-only` does not hold,
so that change is a widening for the purposes of §5 and the resolver MUST
refuse it.

**Clearance and filtering.** A consumer's clearance is a set of scope
labels `C`, supplied by the caller at Core and derived from the identity
system at Extended. An entry with scope `s` MUST be emitted only if some
`c ∈ C` satisfies `c ⊑ s`. `C` MUST NOT be empty; an empty clearance
resolves to `{public}` only where the resolver is explicitly configured
for anonymous consumers.

- At Core conformance the resolver honours scope labels; at Extended they
  MUST resolve to the organisation's identity system (IdP groups or
  claims), never to a parallel access list in the bundle. The mapping
  from group or claim to label lives in resolver configuration, not in
  the bundle.
- Every projection MUST be filtered by the consuming identity's clearance
  before emission. There is no conformant way to emit an unfiltered
  bundle to a consumer.
- Resolvers SHOULD emit a withheld-entry marker where content was
  filtered, so consumers know meaning exists above their clearance
  without learning it. The marker MUST NOT disclose the withheld entry's
  `scope` label, which is itself a fact about the organisation's
  compartments; it MAY disclose the `id` and `owner` where those are
  themselves at or below the consumer's clearance.

Also amend SPEC §5, final paragraph, to read:

> Scopes obey the same direction of travel: a closer bundle MAY narrow an
> entry's scope per the order in §4.2 and MUST NOT widen it. Incomparable
> labels do not narrow; the resolver MUST refuse.

## Alternatives considered

**Do nothing.** The order stays an implementation detail lifted from a
build brief. Two conforming resolvers disagree on any bundle with a fourth
label, which is most real bundles. Rejected.

**Normative total order only; no org-defined labels.** Simplest, and Core
would be trivial. Rejected because §4 already promises extension and
because compartments are the common enterprise case (`hr-only` is the
first label most organisations want). Removing the promise is a larger
break than defining it.

**Full Bell–LaPadula labels — (level, compartment set) pairs, dominance
by level ≥ and compartment ⊇.** This is the mature, audited model, and
DEC-0006 says profile rather than invent. Rejected as the *surface* but
adopted as the *semantics*: a declared `narrower_than` lattice with a set
clearance is exactly a dominance lattice, expressed in a form a domain
owner can author without reading a 1975 MITRE report. An organisation
wanting compartments gets them by declaring sibling labels under
`internal`. Implementers should read the design as a lattice model; the
constitution's "borrow, never rebuild" is satisfied by borrowing the
model, not the notation.

**Infer the order from usage** (a label first seen narrowing `internal` is
below `internal`). Rejected: order would depend on which bundles are on
the path, so the same label could sit at two positions in two
resolutions. Non-deterministic, and a silent widening is one missing
bundle away.

**Let each bundle declare its own labels.** Rejected: a leaf bundle could
then declare `hr-only ⊑ public` and widen everything above it. Scope
vocabulary must be defined once, at the root, where the org's owner of
access classes sits.

## Conformance impact

**Core.** Resolvers gain the default order (three labels, one line of
code), the `scopes:` parser, closure computation, the acyclicity check,
and the two refusal cases. The default-only path costs a small org
nothing: no declaration needed.

Bench tests to add (resolver track):

1. `scope-default-order` — narrowing `public → internal → restricted`
   accepted; each reverse step refused.
2. `scope-undeclared-label` — entry with `scope: hr-only` and no
   declaration → resolution error, not a silent default.
3. `scope-incomparable` — `internal → hr-only` on one path accepted;
   `hr-only → finance-only` refused.
4. `scope-closure` — `hr-exec ⊑ hr-only ⊑ internal ⊑ public` accepted
   transitively.
5. `scope-cycle` — `a narrower_than b`, `b narrower_than a` → validation
   error.
6. `scope-declared-in-leaf` — a `scopes:` block in a non-root bundle is
   ignored and reported.
7. `scope-clearance-filter` — clearance `{hr-only}` sees `public`,
   `internal`, `hr-only`; does not see `finance-only` or `restricted`.
8. `scope-withheld-marker` — marker present, label not disclosed.
9. `scope-identical-output` — two independent resolvers, one lattice,
   byte-identical effective context (the §11 property this RFC restores).

**Extended.** The label-to-IdP mapping is stated to live in resolver
config; no new requirement beyond what §4.2 already implied.

**Full.** Audit events (§8) SHOULD record the clearance set used, not
just a single scope.

## Constitution check

No amendment needed.

- **5 — closer scopes may narrow meaning or authority; they may never
  silently widen it.** This RFC supplies the missing definition of
  "narrow". Without it, principle 5 is unenforceable.
- **6 — security primitives are borrowed, never rebuilt.** The semantics
  are a standard dominance lattice; see alternatives.
- **8 — unknown authority escalates; it never assumes.** An undeclared
  label is a resolution error rather than a default-to-`public` guess.
- **10 — conformance is behavioural.** The identical-output guarantee is
  restored for bundles using org-defined labels.
- **NON-GOALS #5 — not an identity system.** Preserved: labels are
  declared, clearances are supplied, and the mapping between them stays
  in the organisation's IdP and the resolver's configuration.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0009.md` (dec.0009). Normative text landed in SPEC.md
0.3-draft via PR #16.
