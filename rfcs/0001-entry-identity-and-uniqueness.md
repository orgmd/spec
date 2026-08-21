# RFC 0001 — Entry identity: bundle-scoped ids and override semantics

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#1

## Motivation

SPEC §4 and SPEC §5 contradict each other.

§4 requires:

> | `id` | MUST | Stable identifier, unique within the tree (e.g.
> `term.consignment`, `policy.P-03`, `dec.014`) |

§5 requires resolution behaviour that is only reachable when an id is
*not* unique within the tree:

> 3. For **definitions** sharing an `id`: the entry from the bundle
>    closest to the consumer wins.
> 4. […] Where a closer bundle carries a constraint with the same `id` as
>    one above it, the closer version MUST only narrow it […]

A validator implementing §4 rejects every tree that §5 exists to resolve.
The reference implementation cannot satisfy both, so §11's guarantee —
that two conforming resolvers produce the same effective context — has no
content: implementations differ on whether the input is legal at all.

The failure is concrete. A division bundle that narrows `policy.P-03`, or
a team bundle that redefines `term.consignment` in its local sense, is the
central use case in §5.1. Today it is a validation error.

There is a second, quieter gap. §5 orders entries by "closest to the
consumer". The spec never says what happens when two contributing entries
sit at the same distance, nor what makes two ids "the same" string.

## Design

Replace the `id` row of the SPEC §4 table with:

| Field | Requirement | Meaning |
|-------|-------------|---------|
| `id`  | MUST        | Stable identifier, unique within its bundle (e.g. `term.consignment`, `policy.P-03`, `dec.014`). The same `id` in another bundle on the path denotes the same entry, overridden or narrowed per §5. |

Add a new subsection **§4.5 Identity**:

### 4.5 Identity

- An `id` MUST match the production
  `id = segment *( "." segment )` where
  `segment = ALPHA *( ALPHA / DIGIT / "-" / "_" )`, using US-ASCII only.
  Ids are case-sensitive and MUST be compared by exact code-point
  equality after Unicode NFC normalisation. Implementations MUST NOT
  case-fold, trim, or otherwise canonicalise ids.
- The leading segment SHOULD name the domain (`term`, `policy`, `dec`,
  `own`, `done`, `org`).
- An `id` MUST be unique within its bundle. Two entries carrying the same
  `id` in one bundle are a validation error, whether or not they are in
  the same file.
- A bundle MUST be identifiable. The identity entry in `org.md` SHOULD
  carry a `bundle` key holding a stable, org-unique bundle identifier;
  it MUST carry one at Extended conformance. Where no `bundle` key is
  present, the resolver MUST use the bundle reference it was given as the
  bundle's identifier for the duration of the resolution.
- The pair (`bundle`, `id`) MUST be unique across a tree. There is no
  tree-wide uniqueness requirement on `id` alone.
- Entries sharing an `id` across bundles on a path denote **the same
  entry**. They MUST be of the same kind (§2): where a definition and a
  constraint share an `id` on one path, the resolver MUST refuse to
  resolve and MUST report the conflicting (bundle, id) pairs.

Amend SPEC §5 by inserting, before the numbered steps:

> The resolver's input is a **resolution path**: an ordered, duplicate-free
> sequence of bundle references, root first, consumer's node last (see
> §5.2). Entry *A* is **closer** than entry *B* when *A*'s bundle occupies
> a later position in that sequence than *B*'s bundle.

Amend SPEC §5 step 3 to read:

> 3. For **definitions** sharing an `id`: the entry from the bundle
>    closest to the consumer wins; the entries it displaces contribute
>    nothing to effective context. Because positions in a resolution path
>    are distinct and an `id` is unique within a bundle, exactly one
>    entry wins; there is no tie to break. A resolver that is offered a
>    path containing the same bundle twice MUST refuse to resolve it.

Amend SPEC §5 step 4 to read:

> 4. For **constraints**: all applicable entries apply **conjunctively** —
>    they stack. Where a closer bundle carries a constraint with the same
>    `id` as one above it, the closer version MUST only narrow it; a
>    resolver MUST refuse to resolve a widening. Narrowing is evaluated
>    pairwise between adjacent contributors in path order, and the
>    relation MUST hold at every step.

No other §5 text changes.

## Alternatives considered

**Do nothing.** Leaves a blocker: the two normative sections describe
mutually exclusive input languages, and every implementer picks one.
Rejected.

**Keep tree-wide unique ids; express override with a separate field**
(e.g. `overrides: <id>` on the closer entry). This preserves §4 literally
and makes override explicit rather than positional. Rejected because it
doubles the identifier surface (an entry then has an identity *and* a
link), it makes a three-level narrowing chain a hand-maintained linked
list, and typed links between entries are the direction NON-GOALS #9 and
DEC-0007 rule out. It also breaks the plain-reading property: two files
both saying `id: policy.P-03` is what a human expects to mean "the same
policy".

**Make ids URIs, qualified by bundle** (`acme.claims/policy.P-03`).
Genuinely unique, and interoperable with SKOS. Rejected for Core: it puts
the bundle's own name in every entry, so moving or renaming a bundle
rewrites every file in it. The `bundle` key plus a bundle-local `id`
carries the same information without the duplication, and a resolver can
synthesise the URI form for export.

**Allow duplicate ids within a bundle, last-write-wins.** Rejected: file
order within a directory is not portable, so it breaks §11 byte-identical
output.

## Conformance impact

**Core.** Validators change: bundle-scoped rather than tree-scoped
uniqueness, plus the `id` production. Resolvers change only by gaining
explicit refusal cases. The reference `orgmd validate` must be corrected
before it can accept any tree exercising §5.

Bench tests to add (resolver track):

1. `id-dup-in-bundle` — two entries with one `id` in one bundle, in
   different files → validation error.
2. `id-shared-across-bundles` — the §5.1 tree → resolves clean, closest
   definition wins.
3. `id-kind-conflict` — `x.y` as a definition at org level and a
   constraint at team level → refusal, both (bundle, id) pairs named.
4. `id-syntax` — table of accepted and rejected id strings, including
   case-sensitivity and a non-ASCII id (rejected).
5. `path-duplicate-bundle` — the same bundle twice in one path →
   refusal.
6. `id-narrowing-chain` — three bundles narrowing one constraint id →
   pairwise check at each step.

**Extended.** `bundle` becomes MUST, because `org.lock` (§7) identifies
entry hashes per bundle and cannot do so anonymously.

**Full.** No change beyond audit events carrying (bundle, id) rather than
`id`.

## Constitution check

No amendment needed.

- **4 — meaning carries accountability.** Unchanged: each entry still has
  exactly one owner, and an override is an entry with its own owner.
- **5 — closer scopes may narrow, never silently widen.** This RFC makes
  the principle implementable: without shared ids there is nothing to
  narrow. The refusal cases are strengthened, never relaxed.
- **10 — conformance is behavioural.** The point of the change: today's
  contradiction makes byte-identical resolver output undefined.
- **DEC-0007 / NON-GOALS #9** are the reason the `overrides:` alternative
  is rejected; this design adds no typed relationship — same `id` is
  identity, not a relation.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0008.md` (dec.0008). Normative text landed in SPEC.md
0.3-draft via PR #16.
