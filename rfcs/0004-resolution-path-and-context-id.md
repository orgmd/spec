# RFC 0004 — The resolution path: one designated sequence, and a context identifier

- **Status:** draft
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#14

## Motivation

SPEC §5 assumes an organisation is a tree:

> Given the node path (e.g. board → org → division → team → repo), the
> resolver MUST: 1. Collect all entries from every bundle on the path,
> root to node.

Organisations are not trees. A platform team reports into Engineering and
serves Claims; a joint venture sits under two parents; a repository is
shared by two divisions. The real structure is a directed acyclic graph,
and a DAG gives a node more than one path to the root. Three failures
follow.

**Ambiguous winners.** With two paths, `term.consignment` may be defined
by Engineering on one and by Claims on the other, both at the same
distance from the consumer. §5's "closest wins" has no answer, so two
conforming resolvers pick differently and §11's identical-output
guarantee — the property every security claim in this standard rests on —
does not hold.

**Silent restructures.** §5 step 6 requires the resolver to

> Emit the effective context with the bundle versions it was resolved
> from.

Move a team from one division to another and no bundle version changes:
the team's bundle is untouched, the division bundles are untouched. The
consumer's effective context changes — a different division constraint now
stacks — and every version identifier in every projection stays the same.
A cached projection, a gate response, and an audit record all look
unchanged while the meaning underneath them moved. This is a widening
without a trace, which principle 5 exists to prevent.

**An unstated dependency.** The path is an input to resolution as much as
the bundles are, but §5 treats it as background.

## Design

Insert a new subsection **§5.2 The resolution path** (renumbering the
current §5.1 worked example to §5.3):

### 5.2 The resolution path

- The resolver's input is a **resolution path**: a finite, ordered,
  duplicate-free sequence of bundle references, root first, the
  consumer's own node last. "Closer" means later in this sequence (§4.5).
- The organisational hierarchy MAY be a DAG. **This specification resolves
  over a path, not over a graph.** A resolver MUST NOT derive a path by
  traversing a graph, and MUST NOT merge two paths.
- Every consumer MUST be bound to exactly one **designated path**. The
  binding is configuration held by the resolver or the consumer registry;
  it is not carried in the bundles, because a bundle cannot know which
  consumers resolve through it.
- Where a node has several ancestors, the organisation MUST designate one
  sequence and MUST accept the ordering as an explicit choice, including
  the case where the designated path interleaves bundles from two
  branches. Any total order the organisation designates is conformant;
  none may be inferred.
- A resolver offered zero paths, more than one path, or a path containing
  a bundle twice MUST refuse to resolve, MUST report the ambiguity, and
  MUST NOT resolve a subset. Unknown authority escalates.
- The path is **resolution-affecting input**. A change to the sequence —
  reorder, insertion, or removal — is a change to effective context and
  MUST be reflected in the identifier emitted with the result (§5.4),
  whether or not any bundle changed.

Replace SPEC §5 step 6 and add **§5.4**:

> 6. Emit the effective context with the **context identifier** defined in
>    §5.4.

### 5.4 The context identifier

- Every emitted effective context MUST carry a **context identifier**: a
  value that changes whenever any input to resolution changes.
- The identifier MUST be computed over a canonical serialisation of, at
  minimum: the ordered resolution path as a list of (bundle identifier,
  bundle version) pairs; the clearance labels applied (§4.2); and the
  specification version the resolver implemented.
- Bundle versions come from `org.lock` where present (§7) and otherwise
  from a content digest of the bundle. Resolvers MUST NOT substitute a
  timestamp.
- The identifier MUST be stable: the same inputs MUST produce the same
  identifier in every conforming resolver.
- Projections (§6.1) and gate responses (§6.3) MUST carry the context
  identifier in addition to the bundle versions they already carry. Two
  results with the same identifier were resolved from the same meaning;
  two with different identifiers MUST NOT be treated as interchangeable
  by a cache.

Amend SPEC §6.1 item (3) to read:

> (3) mark every projection with the context identifier and the bundle
> versions it was resolved from;

Amend SPEC §6.3, final sentence, to read:

> Gate responses MUST include the context identifier, the bundle
> versions, and the `id`s relied upon.

Amend SPEC §10's detection list by adding one item:

> and consumers whose designated path changed since their last
> resolution, which changes effective context without changing any
> bundle.

## Alternatives considered

**Do nothing.** The spec keeps claiming a tree while implementers meet
DAGs on their first real org chart. Each invents a tie-break, and §11
becomes untestable outside toy fixtures. Rejected.

**Define a deterministic graph merge** — collect from all paths, break
ties by a declared precedence between parents. Tempting, because it
automates the matrix-org case. Rejected on three counts: it needs a
precedence relation between bundles, which is a typed relationship
between entries in all but name (NON-GOALS #9, DEC-0007); the merge of two
narrowing chains is not itself guaranteed to be a narrowing, so principle
5 would need a separate proof at every merge point; and it puts graph
algorithms in the trusted base that AGENT-BRIEF §3 requires a reviewer to
audit in an afternoon. A designated path gets the same expressive result —
the organisation can designate a path that interleaves both branches —
with the choice made by an accountable human rather than a tie-break rule.

**Deepest-first, then alphabetical by bundle id.** Deterministic and
free. Rejected: it is deterministic without being *meaningful*. Renaming a
division silently changes which policy wins.

**Resolve all paths and refuse on any disagreement.** Safe, and it
surfaces real conflicts. Rejected as the default: in a matrix org, two
paths disagreeing on a term is the normal state, not an incident, so the
resolver would refuse most real trees. Tooling MAY offer this as a
diagnostic mode under §10 drift detection; it is not resolution.

**Version identifier over bundles only** (status quo). Rejected: it is
precisely the mechanism that makes a restructure invisible.

**A monotonic counter or timestamp instead of a digest.** Rejected: not
reproducible across resolvers, so §11 fails.

## Conformance impact

**Core.** §5 gains the path contract and the context identifier.
Resolvers must compute a digest over their inputs — a few lines — and
carry it into projections. The refusal cases are new. Small orgs with a
genuine tree are unaffected in practice: their designated path is the tree
path, and the identifier is computed automatically.

Bench tests to add (resolver track):

1. `path-single` — a tree path resolves as today.
2. `path-ambiguous` — a node with two ancestor paths and no designation →
   refusal naming both candidates.
3. `path-designated` — the same DAG with a designated path → resolves,
   and the designated order determines the winner.
4. `path-interleaved` — a designated path drawing from two branches →
   resolves; narrowing checked pairwise in path order.
5. `path-duplicate-bundle` — shared with RFC 0001 test 5.
6. `context-id-stable` — same path, same bundles, same clearance, two
   independent resolvers → identical identifier.
7. `context-id-path-change` — bundles byte-identical, path reordered →
   identifier MUST differ.
8. `context-id-clearance` — same path, two clearances → identifiers
   differ.
9. `context-id-in-projection` — every advisory target carries it.
10. `gate-response-context-id` — `org.policy` response carries it
    (Extended).

**Extended.** The gate's determinism claim in §6.3 becomes checkable: the
tuple is (context identifier, action), and the identifier now covers the
path. `org.lock` supplies the bundle versions the identifier is computed
over.

**Full.** Audit events (§8) SHOULD record the context identifier, which
makes "what did this agent actually know at 02:00" answerable from one
value.

## Constitution check

No amendment needed.

- **2 — meaning is canonical only by explicit designation.** The
  designated path is the same principle applied to structure: the path is
  designated, never inferred.
- **5 — closer scopes may narrow; never *silently* widen.** The context
  identifier is what removes "silently" from a restructure.
- **8 — unknown authority escalates; it never assumes.** An ambiguous
  path is refused rather than guessed.
- **10 — conformance is behavioural.** Tests 6–8 are the first tests that
  can actually falsify the identical-output claim on a non-tree org.
- **12 — anything not requiring shared organisational meaning stays
  outside the standard.** Honoured: this RFC deliberately does not model
  the org chart. It states the constraint the standard imposes on whoever
  does.

## Decision

Filled by the editor.
