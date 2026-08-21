# ORG.md Specification

**Version:** 0.3.1-draft
**Status:** Draft — open for comment via RFC (see GOVERNANCE.md)
**Editor:** Matt (BoundFor Ltd)
**License:** CC BY 4.0 (this document); reference implementations Apache-2.0
**Last updated:** August 2026
**Changed in 0.3.1:** ratification split from lifecycle state — a revision's
`status` is now ratification only (`draft` | `approved` | `rejected`), while
contestation and retirement are entry-level acts (§4.1, §4.7), removing the
resurrection hazard by which contesting or retiring a revision silently
elected an older one; bundle-level metadata folded into the content
identifier — bundle id, scope lattice, grace window and entry lifecycle
state now change it, and the general rule that every value capable of
changing resolution, disclosure, identity or authority must (§7.1, §5.5);
disclosure Mode A made the only conforming Core behaviour, Mode B an
Extended capability whose declared mode is a resolver input (§5.4, §5,
§11); Core role binding clarified — organisational semantics at Core,
identity-backed ratification an Extended guarantee (§9); raw-bundle storage
invariant added — bundle access at least as restrictive as its most
restricted entry (§4.2, SECURITY.md); classification boundary stated —
ORG.md evaluates no business data (§4.6); §7.2–§7.6 marked Experimental
pending a second implementation (§7); the Core "afternoon" claim narrowed
to adoption rather than resolver implementation (§11).
**Changed in 0.3:** entry identity and container grammar (§3.1, §4.5; RFC
0001/0003); scope lattice and the disclosure/applicability split (§4.2,
§5.4; RFC 0002/0008); policy decision function and structural narrowing
(§4.6, §5; RFC 0005/0006); revisions, sync state machine, staleness
consequences and owner of last resort (§4.3, §4.7, §4.8, §9; RFC
0012/0013); designated resolution path and context identifier (§5.1,
§5.5; RFC 0004); authority-bounded resolution (§5.2; RFC 0011);
resolution-failure semantics (§5.3; RFC 0007); reliance-scoped
`contested` (§4.1; RFC 0010); enforcement requires interposition (§6.4;
RFC 0009); integrity mechanised — TUF roles, path delegation,
whole-directory hashing, freeze horizon, Core content identifier (§7; RFC
0014); conformance split from benchmark score (§11; RFC 0015).
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
  action: policies). The domain determines the kind (§3). Definitions
  subdivide into **authority definitions** (the `ownership` and
  `decisions` domains) and **ordinary definitions** (§5.2).
- **Revision** — one version of an entry: a front-matter block plus a
  body, carrying a `rev`. An entry is a sequence of revisions sharing an
  `id`; the **effective revision** is the highest ratified `rev` — the
  highest `rev` whose `status` is `approved` (§4.7).
- **Ratification** — the act by which a human owner accepts a revision
  (§9). It is the only authored state a revision carries (§4.1).
- **Entry lifecycle state** — contestation and retirement (§4.1). Both
  attach to the entry, never to a revision, and neither changes which
  revision is effective.
- **Authority definition** — a definition in the `ownership` or
  `decisions` domain. Authority definitions resolve from their anchoring
  bundle rather than closest-wins (§5.2).
- **Resolution path** — the ordered, duplicate-free sequence of bundle
  references the resolver resolves over, root first, consumer's node last
  (§5.1).
- **Context identifier** — the value emitted with every effective context
  that changes whenever any input to resolution changes (§5.5).
- **Resolver** — the component that computes **effective context**: the
  set of entries that apply to a given consumer, after the rules in §5.
  Consumers never traverse the tree themselves.
- **Projection** — a generated, never canonical, rendering of effective
  context for a target (AGENTS.md fragment, prompt block, MCP gate,
  handbook).
- **Consumer** — any human or agent identity that receives a projection.
- **Gate** — an enforcing projection: a tool interface whose responses
  are deterministic (§6.3).

## 3. Bundle layout

The normative unit is the **semantic domain**, not the filename. The
layout below is RECOMMENDED; implementations MUST map files to domains
and MUST ignore unknown files and front-matter keys. This is a parsing
rule. At Extended conformance, §7.4 requires every file in a signed
bundle to be covered by `org.lock`.

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
one meaning file is valid; a **root** bundle MUST additionally declare an
owner of last resort (§9).

### 3.1 Content file grammar

A **content file** is a UTF-8 encoded sequence of one or more **entry
records**. Files are Markdown, readable by a human with no tooling.

```abnf
content-file  = [ BOM ] entry-record *( blank-line entry-record )
entry-record  = delimiter LF yaml-block delimiter LF [ body ]
delimiter     = "---"          ; exactly three HYPHEN-MINUS, alone on the line
blank-line    = *WSP LF
```

Normatively:

- A content file MUST begin with a delimiter line, optionally preceded by
  a UTF-8 byte order mark. A file that does not is not a content file: it
  contains no entries and MUST be ignored, with a warning.
- A **delimiter line** is a line whose entire content is exactly the three
  characters `---`, with no leading whitespace and no trailing characters
  other than the line ending. A line of four or more hyphens is never a
  delimiter.
- Line endings MAY be LF or CRLF. Implementations MUST accept both and
  MUST normalise to LF before hashing (§7).
- The **front-matter block** is the text between the first two delimiter
  lines of a record. It MUST be a YAML 1.2 mapping. Duplicate keys are a
  validation error. Implementations MUST ignore unknown keys.
- The **body** is every line after the record's closing delimiter, up to
  but not including the next record's opening delimiter, or end of file.
  Leading and trailing blank lines of a body are not part of it.
- After the first record, an opening delimiter MUST be preceded by a blank
  line. A delimiter line not preceded by a blank line therefore never
  starts a record — which is what makes a setext level-2 heading (`Text`
  on one line, `---` on the next) unambiguous.
- When scanning for the next opening delimiter, implementations MUST track
  CommonMark fenced code blocks (backtick and tilde fences) and MUST NOT
  treat any line inside an open fence as a delimiter.
- Outside a fence, a body line that would be read as an opening delimiter
  — a `---` line preceded by a blank line — **is** an opening delimiter.
  It is not escapable. A body that needs a thematic break MUST use `***`
  or `___`, both of which CommonMark renders identically and neither of
  which the container reads. Where the resulting front-matter block is not
  a valid YAML mapping, the file is invalid and the error MUST name the
  line number of the offending delimiter and state this rule.
- The entry's `id` (§4) identifies it; position in the file carries no
  meaning. Implementations MUST NOT depend on entry order within a file,
  and MUST process files within a bundle in an order that does not affect
  output (§11).

A file MAY hold one entry or many. One entry per file is RECOMMENDED for
`decisions/`, where MADR conventions apply (§4.4); many entries per file
is RECOMMENDED for `glossary.md`, `policies.md`, `ownership.md` and
`done.md`, where an entry is a sentence or two and one file per term
would be hostile to a human reader.

### 3.2 Worked example

```markdown
---
id: term.bundle
owner: role.editor
scope: public
status: approved
source: native
rev: 1
---
**bundle** — a directory tree conforming to §3, attached to one node.

---
id: term.entry
owner: role.editor
scope: public
status: approved
source: native
rev: 1
---
**entry** — one unit of meaning with the §4 fields.
```

## 4. Entry model

Every entry MUST carry:

| Field      | Requirement | Meaning |
|------------|-------------|---------|
| `id`       | MUST        | Stable identifier, unique within its bundle (e.g. `term.consignment`, `policy.P-03`, `dec.014`). The same `id` in another bundle on the path denotes the same entry, overridden or narrowed per §5. |
| `owner`    | MUST        | Exactly one accountable owner (role or identity). Disputes route here. |
| `scope`    | MUST        | Access label. Defaults: `public`, `internal`, `restricted`. Organisations MAY define more (§4.2). |
| `status`   | MUST        | Ratification state of this revision: `draft` \| `approved` \| `rejected` (§4.1). Contestation and retirement are entry-level state and MUST NOT appear here. |
| `source`   | MUST        | `native` or `synced:<system>` (§4.3) |
| `rev`      | MUST        | Revision identifier: an integer, unique within the entry, monotonically increasing (§4.7) |
| `revisit`  | MUST for constraints and `decisions`; SHOULD otherwise (§4.8) | Date after which the entry is treated as stale unless re-confirmed |
| `upstream` | MUST for `source: synced:<system>` | Provenance of this revision: `system`, `ref`, `fetched` (date), `digest` (upstream content digest) |
| `delegates`| MAY         | Authority definitions only: node paths permitted to redefine this `id` for their own subtree (§5.2) |
| `ref`      | MAY         | Link to fuller material in a system of record (rationale, minutes, standards) |

Every entry in a **constraint** domain (§3; today, `policies.md`) MUST
additionally carry `action` and `effect`, and MUST carry `route` where
`effect` is `escalate` (§4.6). An entry in a **definition** domain MUST
NOT carry `action`, `effect`, or `route`. One entry carries one action and
one effect; a single entry MUST NOT carry a list of either. An entry
expressing more than one constraint MUST be written as more than one
entry. This keeps `id` a stable handle on exactly one rule, which
narrowing (§5), reliance (§4.1) and audit (§8) all depend on.

There is **no confidence field**. Uncertainty is expressed through
`draft` and `contested`; a stored confidence number invites consumers to
threshold on it, which is neither enforceable nor auditable.

### 4.1 Ratification and lifecycle semantics

Two kinds of state govern an entry, and they are kept apart. **Ratification
state** is authored, carried by `status`, and belongs to a single revision.
**Lifecycle state** — contestation and retirement — is recorded against the
entry as a whole and MUST NOT be expressed as a `status` value. Neither
lifecycle act changes which revision is effective (§4.7): a dispute or a
retirement never elects an older revision.

**Ratification state (per revision).**

- `draft` — proposed meaning, not yet ratified. A draft revision never
  resolves, is never emitted into a consumer projection except into an
  explicitly-requested preview target, and is never covered by `org.lock`
  (§7.2).
- `approved` — ratified by a human currently holding the entry's `owner`
  role (§9). The highest approved `rev` is the entry's effective revision
  (§4.7); consumers use it normally.
- `rejected` — put to the entry's owner and not ratified, or closed out by
  the ratification of a higher revision (§4.7). A rejected revision never
  resolves and is never covered by `org.lock` (§7.2). Rejected revisions,
  and approved revisions below the effective one, are retained for
  history; compilers MUST NOT emit either except in audit views.

**Lifecycle state (per entry).**

- **Contested** — the entry is under dispute, and blocking by **reliance
  only** (§5 step 5). A consumer relies on an entry when that entry's `id`
  appears in the `relied_upon` set of a verdict (§4.6) or is the entry
  returned by a definition-domain read. An agent MUST NOT take autonomous
  action that relies on a contested entry, and MUST escalate to that
  entry's `owner`. A contested entry the action does not rely on MUST NOT
  block the action, MUST NOT change its verdict, and MUST NOT be reported
  as bearing on it. Contested entries MUST still be marked visibly
  wherever they are emitted (§6.1): marking is not propagation. The
  contest is against the entry's effective revision, which continues to
  resolve; recording or withdrawing a contest MUST NOT change, rewrite or
  re-status any revision. Only the entry's `owner`, or an identity on that
  entry's escalation path, MAY record or withdraw a contest;
  implementations MUST reject the act from any other identity. Any other
  identity, including any agent, MAY only *request* it, which routes to
  the owner per §9. Every recording or withdrawal of a contest MUST be
  attributable and recorded per §8 with the acting identity, timestamp,
  entry `id`, the bundle version before and after, and a `ref` to the
  dispute; an unattributable act MUST be rejected, not recorded as
  anonymous. A `synced:` entry MUST NOT be contested in the bundle; the
  dispute belongs in the system of record and arrives through the adapter
  (§4.3).
- **Retired** — the entry's `owner` has withdrawn it. A retired entry does
  not resolve, and no revision of it resolves; compilers MUST NOT emit it
  except in audit views. Only a human currently holding the entry's
  `owner` role MAY retire an entry or return it to service, and the act
  MUST be attributable and recorded per §8 exactly as a contest is.
  Retirement withdraws the entry; it MUST NOT be implemented by altering
  the ratification state of any revision.

Both lifecycle acts are recorded against the entry, alongside its
revisions, and MUST leave every existing revision byte-identical. This
specification does not fix their representation in a bundle; whatever an
implementation uses, it MUST NOT be a `status` value, MUST be
attributable, and MUST be recorded per §8.

**Staleness is computed, never authored.** An entry past its `revisit`
date, orphaned by an owner change, or whose `synced:` source has moved is
stale; tooling derives this and flags it (§10). There is no `stale`
status a human can set, because such a status would itself go stale.
Staleness is not only reported: it changes what consumers and gates do
(§4.8, §6.1, §6.3).

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
  is a **resolution error** (§5.3): the resolver MUST refuse to resolve
  it and MUST NOT fall back to a default. An unknown access class is
  unknown authority.

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
- **Clearance governs disclosure, not applicability.** A resolver MUST
  NOT remove an entry from resolution on clearance grounds. Clearance
  applies to emission only (§5.4). A policy applies to an action because
  of what the action is, not because of who is asking.
- Where a constraint is redacted on clearance grounds, a **withheld
  marker** MUST replace it — this is a MUST for constraints, not a
  SHOULD. Markers MUST have a shape that does not vary with the withheld
  content, and MUST NOT disclose the withheld entry's `scope` label,
  which is itself a fact about the organisation's compartments. A marker
  MAY disclose the `id` and `owner` only where those are themselves at or
  below the consumer's clearance. Projections MUST NOT read as a complete
  set of constraints when they are not.

**Storage invariant.** Scope-based disclosure operates at resolution and
projection. It does not alter what raw bundle storage exposes: anyone who
can read the bundle's files reads every entry in it, whatever its `scope`.
Access to a raw bundle MUST therefore be at least as restrictive as the
most restricted entry stored in it. An organisation needing finer
separation of raw storage SHOULD split entries into separately stored
bundles, one per compartment, and rely on the resolution path to bring
them back together. Granting read access to a mixed-scope bundle on the
basis that the resolver will filter it is a misconfiguration, not a
conformance level.

### 4.3 Source semantics — canonical by exception

- `synced:<system>` — the system of record is elsewhere; an adapter
  maintains the entry. An adapter MUST write an upstream change as a new
  revision with `status: draft` and a higher `rev` than any existing
  revision. An adapter MUST NOT modify, delete, reorder, re-status or
  re-sign any existing revision, and MUST NOT write any status other than
  `draft`. An adapter MUST NOT contest or retire an entry; both are acts
  of the human owner (§4.1). An adapter MUST NOT change an entry's `id`,
  `owner`, `scope` or `source`; a change to any of these upstream MUST be
  written as a draft revision proposing it, never applied. In particular
  an adapter MUST NOT convert a `native` entry to `synced:`.
- A human proposing a native change to a `synced:` entry MUST do so as a
  new `draft` revision, exactly as an adapter does. There is no in-place
  edit of a synced entry.
- `native` — no system of record exists; the bundle is canonical for
  this entry.
- Bundles are intended to be mostly synced **in origin**: where a system
  of record exists, an adapter proposes the entry rather than a human
  retyping it. Origin is not authority. Every revision that resolves has
  been ratified by the accountable human owner, whatever its `source`.
  Sync moves text; ratification confers authority. Tooling SHOULD surface
  the synced-to-native ratio, and the count of unratified (pending)
  revisions, as health signals.

### 4.4 Decision and policy entries

Decision files SHOULD follow existing ADR/MADR conventions where they
apply — the format thousands of engineers already know. A decision
records what is now true and who owns it; rationale beyond what a
consumer needs to act belongs in the organisation's own systems via
`ref:` (§9). A policy entry MUST be expressible as a decision function
over an action — `allow`, `escalate` (with a route), or `deny`; guidance
that cannot be expressed this way belongs in `org.md` tone or the
handbook, not `policies.md`. The entry body remains prose: the body
explains the rule to a human, the fields decide it. Where body and fields
diverge, the fields govern, and tooling SHOULD flag the divergence for the
owner.

### 4.5 Identity

- An `id` MUST match the production `id = segment *( "." segment )` where
  `segment = ALPHA *( ALPHA / DIGIT / "-" / "_" )`, using US-ASCII only.
  Ids are case-sensitive and MUST be compared by exact code-point
  equality after Unicode NFC normalisation. Implementations MUST NOT
  case-fold, trim, or otherwise canonicalise ids.
- The leading segment SHOULD name the domain (`term`, `policy`, `dec`,
  `own`, `done`, `org`).
- An `id` MUST be unique within its bundle. Two entries carrying the same
  `id` in one bundle are a validation error, whether or not they are in
  the same file. (Two *revisions* of one entry share an `id` by
  definition and are distinguished by `rev`; see §4.7.)
- A bundle MUST be identifiable. The identity entry in `org.md` SHOULD
  carry a `bundle` key holding a stable, org-unique bundle identifier; it
  MUST carry one at Extended conformance. Where no `bundle` key is
  present, the resolver MUST use the bundle reference it was given as the
  bundle's identifier for the duration of the resolution.
- The pair (`bundle`, `id`) MUST be unique across a tree. There is no
  tree-wide uniqueness requirement on `id` alone.
- Entries sharing an `id` across bundles on a path denote **the same
  entry**. They MUST be of the same kind (§2): where a definition and a
  constraint share an `id` on one path, the resolver MUST refuse to
  resolve that `id` and MUST report the conflicting (bundle, id) pairs
  (`kind_mismatch`, §5.3).
- `own.last-resort` is a reserved `id` naming the owner of last resort
  (§9). `role.*` is the conventional namespace for owner roles.

### 4.6 Action grammar and matching

**Grammar.** Action tokens are dot-separated segments, deliberately close
to the shape of tool names an implementation is already routing.

```abnf
action-token   = segment *( "." segment )
action-pattern = segment *( "." segment ) "." "*"
segment        = lower *( lower / digit / "_" / "-" )
lower          = %x61-7A          ; a-z
digit          = %x30-39          ; 0-9
```

- An `action` value MUST match `action-token` or `action-pattern`.
- `*` MUST appear only as the whole final segment, and MUST NOT be the
  only segment. `billing.*` is valid; `*`, `bill*.read` and `a.*.b` are
  not.
- Tokens MUST be US-ASCII lowercase as generated by the grammar.
  Validators MUST reject any other input rather than case-folding or
  transliterating it; silent normalisation is a divergence source between
  implementations.
- Segments are compared by byte equality after Unicode NFC normalisation
  of the *input action* supplied to `org.policy`. An input action that
  does not match `action-token` after NFC normalisation MUST be rejected
  by the gate with a malformed-input error; it MUST NOT be treated as an
  uncovered action, because "reject" and "escalate" are different
  answers.

The single-trailing-wildcard restriction is intentional: specificity is
then a segment count and containment a prefix test, both auditable by eye.

**The classification boundary.** ORG.md policy actions are
**already-classified organisational actions**. ORG.md does not classify raw
business events, and its decision function evaluates no business data: no
amounts, dates, counterparties, quantities or record contents are inputs to
a verdict. Where a rule turns on such a value, it MUST be expressed in one
of two ways: as distinct pre-classified actions, the classification having
been made upstream by the system that holds the data (e.g.
`payments.refund.issue.high-value` beside `payments.refund.issue`); or as
an authored `escalate` whose prose body states the condition for the human
on the `route` to apply. Both are legal and neither adds a condition
language to this specification.

**Matching.** Given an input action `A`, an entry with action value `P`
matches `A` when `P` is a token equal to `A`, or `P` is a pattern with
literal prefix segments `p1..pn` and `A` has at least `n+1` segments whose
first `n` segments equal `p1..pn`. A pattern MUST NOT match an action
equal to its own literal prefix: `billing.*` does not match `billing`.
Where both are wanted, author both entries.

**Specificity** is the number of literal segments in an entry's action
value, ordered first by literal segment count, then exact-before-pattern.

**Effect strength** is the total order `deny > escalate > allow`.

**Verdict, stage 1 — local verdict, per bundle.** For each bundle on the
resolution path the resolver MUST:

1. take the set of that bundle's constraint entries that match `A` and
   are eligible under §4.1 (clearance MUST NOT affect membership, §5.4);
2. if the set is empty, the bundle has no local verdict and is skipped;
3. otherwise retain only the entries of greatest specificity;
4. the bundle's local verdict is the strongest `effect` among the
   retained entries, and its local relied-upon set is the `id`s of the
   retained entries carrying that effect.

**Verdict, stage 2 — effective verdict, across bundles.** The effective
verdict is the **strongest** local verdict of any bundle on the path. The
relied-upon set is the union of the local relied-upon sets of every bundle
whose local verdict equals the effective verdict. Stage 2 MUST NOT compare
specificity across bundles. A closer bundle can therefore make a rule
stricter and can never make it weaker; stage 2 is commutative and
associative over bundles, so the verdict does not depend on traversal
order.

**Uncovered actions.** Where no bundle produces a local verdict the gate
MUST return `escalate` (§6.3). The response MUST distinguish this case
from an authored `escalate`: an uncovered action indicates missing meaning
and SHOULD be counted by drift tooling (§10).

**Route.** Where the effective verdict is `escalate` and the relied-upon
set is non-empty, the response MUST carry the `route` of every
relied-upon entry. Where the relied-upon set is empty (uncovered action),
the response MUST carry the escalation target of the node itself, taken
from the ownership domain. A `route` MUST be an identifier resolvable in
the tree's ownership domain (an `own.*` or role identifier); free text
MUST NOT be accepted, because an escalation target a machine cannot
resolve is a comment.

**Determinism.** Matching, specificity and both stages are total
functions of (context identifier, identity, action). Two conforming
resolvers given the same inputs MUST produce the same verdict, the same
relied-upon set and the same routes. Ties are impossible by construction:
within a bundle, retained entries of equal specificity are collapsed by
effect strength, and two entries with the same `id` in one bundle are
already a validation error.

**`org.define(term)` lookup.** The argument is a lookup key. Resolvers
MUST apply, in order: (1) **id lookup** — if the key matches an entry `id`
in the effective context byte for byte, that entry is the result; (2)
**label lookup** — otherwise the key is normalised (Unicode NFC;
lowercase; trim leading and trailing whitespace and punctuation; replace
each internal run of whitespace or `_` with a single `-`; drop any
remaining character outside `a-z0-9-`) and the normalised key `k` is
compared against `term.<k>` and against the identically-normalised display
label of each definition entry; (3) if neither step yields exactly one
entry, the lookup is a **miss**. Resolvers MUST NOT perform fuzzy,
stemmed, embedding-based or otherwise approximate matching: ORG.md answers
"what is canonical", not "what is relevant". A miss MUST be returned as a
structured response (§6.3), never synthesised, paraphrased or inferred.

### 4.7 Revisions and sync states

An entry is a sequence of **revisions** sharing an `id`. Each revision is
a front-matter block plus a body, carries all the fields in §4, and is
identified by `rev`. Revisions of one entry SHOULD live in one file, as
successive front-matter blocks, so a human with no tooling can read the
history. Implementations MUST map revisions to entries by `id` and MUST
ignore unknown keys (§3.1).

The **effective revision** of an entry is the highest `rev` with status
`approved`. It is a function of ratification state alone: no lifecycle act
(§4.1) may change which revision is effective. Resolvers MUST resolve the
effective revision and MUST ignore all others; the contested handling in
§4.1 applies to the entry, and a retired entry does not resolve at all. An
entry with no `approved` revision has no effective revision and MUST NOT
resolve.

**States.** An entry occupies exactly one state, computed, never
authored. Where more than one of the conditions below holds, the first
matching state in this list is the entry's state — **retired**,
**contested**, **orphaned-upstream**, then the ratification states
**proposed**, **pending**, **current**:

- **proposed** — one or more `draft` revisions, no `approved` revision.
  The entry does not resolve; nothing is projected.
- **current** — an `approved` revision exists, with no `draft` revision
  above it. The normal state.
- **pending** — an `approved` revision exists and at least one `draft`
  revision has a higher `rev`. The approved revision continues to
  resolve. The pending delta is unratified drift.
- **contested** — the entry carries an active contest against its
  effective revision (§4.1). That revision continues to resolve, marked.
- **orphaned-upstream** — the `upstream` reference no longer resolves.
  The approved revision continues to resolve, and the entry is stale
  (§4.8).
- **retired** — the entry has been retired by its owner (§4.1); it no
  longer resolves. The entry stops resolving because it was withdrawn,
  not because any revision's ratification state changed.

Contestation and retirement are recorded acts; the states above remain
computed, because the state is derived from the record and from the
revision set, never authored as a status.

**Transitions.**

| From | Event | To | Who |
|---|---|---|---|
| — | adapter fetches new upstream meaning | proposed | adapter |
| proposed | owner ratifies rev N | current | human owner |
| proposed | owner rejects rev N | proposed / — | human owner |
| current | adapter fetches changed upstream | pending | adapter |
| pending | owner ratifies rev N | current | human owner |
| pending | owner rejects rev N | current | human owner |
| current, pending | owner or escalation path records a contest | contested | human owner or escalation path |
| contested | owner withdraws the contest | current / pending | human owner or escalation path |
| current, pending | upstream reference stops resolving | orphaned-upstream | drift tooling |
| current, pending | owner retires the entry | retired | human owner |
| retired | owner returns the entry to service | current / pending | human owner |

Normative rules on those transitions:

- Only a human holding the entry's `owner` role may ratify a draft
  revision to `approved` (§9). Ratification MUST be a reviewed write in
  the sense of §7: adapters write proposals into the change-review
  channel, and the served bundle changes only when a ratified change
  merges. Tooling MUST NOT auto-merge, auto-ratify, or ratify on a timer.
- Ratifying `rev` N marks every `draft` revision below N `rejected`; it
  MUST NOT alter any `approved` revision, which is retained for history
  and simply ceases to be the highest ratified one. Rejecting `rev` N
  marks N `rejected` and leaves the effective revision unchanged.
  Ratification is per revision, not per entry: an owner ratifying an older
  revision while a newer draft exists leaves the entry **pending**.
- Contesting or retiring an entry MUST NOT change its `status` fields and
  MUST NOT change its effective revision (§4.1). An owner who wants
  different meaning to resolve ratifies a further revision; an owner who
  wants no meaning to resolve retires the entry.
- Entering **orphaned-upstream** MUST NOT delete or unpublish the
  approved revision. Meaning does not disappear because a wiki page was
  moved; it goes stale and the owner decides.

**Native edits and the upstream race.** Where a `draft` revision is
pending and the adapter fetches a further upstream change, the adapter
MUST append another `draft` revision; it MUST NOT discard, rebase or
merge the pending revision. Where two pending drafts of one entry have
different `upstream.digest` values, or one is native-authored and one
adapter-authored, the entry MUST be flagged as a **divergence** by drift
tooling (§10), and the ratifying owner MUST be shown both. The resolver's
behaviour is unaffected: the approved revision keeps resolving until the
owner acts.

**Untrusted draft content.** Adapter-written revisions are untrusted
input.

- Compilers MUST NOT emit `draft` revisions into consumer projections.
- `org.lock` MUST cover only revisions with status `approved` (§7.2).
- Interfaces that present a draft revision to a ratifying human MUST
  render it as inert text. A diff view MUST NOT be an agent surface: a
  reviewing tool MUST NOT execute, follow, or act on instructions found
  in draft content, and where a model summarises a diff, its output MUST
  be labelled advisory and MUST NOT be able to ratify.
- Gates MUST answer from effective revisions only. An action covered only
  by a `draft` or `rejected` revision is not covered: the gate returns
  `escalate`, never `allow` (§6.3).

### 4.8 Staleness consequences

An entry is **stale** when any of the following holds at resolution time:

1. `revisit` is in the past;
2. its `owner` cannot be resolved to a current holder (§9);
3. its `source` is `synced:` and the upstream reference has moved or
   stopped resolving.

`revisit` MUST be present on every constraint entry and on every entry in
the `decisions` domain. Bundle validation MUST fail where such an entry
has no `revisit`; resolvers MUST NOT resolve it and MUST record a
`validation.missing-revisit` diagnostic. A constraint nobody has agreed to
look at again is not a constraint; it is a sentence. Organisations SHOULD
set `revisit` from the entry's rate of change, not from a uniform default;
tooling SHOULD propose a date and MUST NOT set one without an owner
ratifying it.

Normative consequences:

- Resolvers MUST mark stale entries in the effective context, with the
  reason.
- Compilers MUST mark stale entries visibly in **every** projection,
  advisory and enforced alike, as contested entries are marked (§6.1). A
  projection that hides staleness misrepresents the bundle.
- Agents MUST treat a stale constraint or decision as they treat a
  contested one (§4.1): no autonomous action that depends on it;
  escalate to the entry's owner.
- At the gate (§6.3): where any policy entry matching the action is
  stale, `org.policy(action)` MUST NOT return `allow`. It MUST return
  `escalate`, routed to the stale entry's owner. A stale entry whose
  verdict would be `deny` MUST still return `deny` — staleness may only
  make the answer more conservative, never less.
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

## 5. Resolution

Consumers do not read bundles; they receive **effective context**. A
consumer (or the tooling acting for it) asks the resolver: *what applies
to this identity, at this node, at this clearance?*

The resolver's input is a **resolution path**: an ordered, duplicate-free
sequence of bundle references, root first, the consumer's own node last
(§5.1). Entry *A* is **closer** than entry *B* when *A*'s bundle occupies
a later position in that sequence than *B*'s bundle.

Given the resolution path, the resolver MUST:

1. Collect all entries from every bundle on the path, root to node,
   selecting the effective revision of each entry (§4.7) and ignoring all
   other revisions. A retired entry (§4.1) contributes nothing and MUST be
   omitted here; an entry under contest is collected normally, and its
   contest is carried through to steps 5 and 6.
2. Resolve definitions and compute constraint verdicts (§4.6) over the
   **complete, unfiltered** entry set. Clearance MUST NOT affect
   membership of the decision set.
3. For **ordinary definitions** sharing an `id`: the entry from the
   bundle closest to the consumer wins; the entries it displaces
   contribute nothing to effective context. Because positions in a
   resolution path are distinct and an `id` is unique within a bundle,
   exactly one entry wins; there is no tie to break. A resolver offered a
   path containing the same bundle twice MUST refuse to resolve it. For
   **authority definitions** sharing an `id`, §5.2 applies.
4. For **constraints**: all applicable entries apply **conjunctively** —
   they stack — and the effective verdict is the strongest local verdict
   on the path (§4.6); specificity is never compared across bundles.
   Where a closer bundle carries a constraint with the same `id` as one
   above it, the closer entry MUST **narrow** it structurally: its action
   set MUST be contained in the parent's, and its effect MUST be no
   weaker under `deny > escalate > allow`. The test is checked pairwise
   between adjacent contributors in path order and MUST hold at every
   step. A resolver MUST NOT honour any author-supplied assertion that
   one entry narrows another; no claim by a bundle about its relationship
   to another bundle's entry may affect resolution. A failing check is a
   resolution error scoped to that `id` (§5.3).
5. Propagate contestation by **reliance only** (§4.1). Resolvers MUST
   report, per response, which relied-upon entries are contested, so a
   consumer can apply the rule without re-deriving reliance.
6. Apply the consuming identity's clearance to emission (§5.4), then emit
   the effective context with the context identifier (§5.5), the
   relied-upon `id`s, and any resolution errors (§5.3).

Where action containment is needed for step 4: for action values `C`
(closer) and `Pn` (parent), `C ⊆ Pn` holds when `Pn` is a token and `C` is
the same token; or `Pn` is a pattern with literal prefix `p1..pn` and `C`
is a token of at least `n+1` segments whose first `n` segments equal
`p1..pn`; or `Pn` is a pattern with literal prefix `p1..pn` and `C` is a
pattern with literal prefix `c1..cm` where `m ≥ n` and `c1..cn` equal
`p1..pn`. Containment is otherwise false. A closer entry byte-identical to
the parent trivially narrows. Where both parent and closer effects are
`escalate`, `route` MAY differ: an escalation may be routed to a closer
owner without weakening the constraint. A resolver MUST NOT reject a
bundle merely because a closer constraint carries an `id` no ancestor
uses; distinct `id`s stack. Reusing an ancestor's `id` is a claim of
continuity — this is the same rule, tightened here. An author who wants a
different rule SHOULD give it a different `id` and let it stack, and
tooling SHOULD say so in the error text.

Scopes obey the same direction of travel: a closer bundle MAY narrow an
entry's scope per the order in §4.2 and MUST NOT widen it. Incomparable
labels do not narrow; the resolver MUST refuse. Scope narrowing affects
disclosure only, never membership of the decision set (§5.4).

**The resolver is part of the trusted base.** Every security property of
this standard depends on resolver correctness, so resolvers are
first-class subjects of conformance (§11): two conforming resolvers given
the same tree, identity, clearance, and declared disclosure mode (§5.4)
MUST produce the same effective context, the same relied-upon set, and the
same `resolution_errors` list in the same order, compared over the
canonical serialisation of §7.1. At Core the mode is fixed to Mode A, so
the tuple reduces to (tree, identity, clearance).

### 5.1 The resolution path

- The resolver's input is a **resolution path**: a finite, ordered,
  duplicate-free sequence of bundle references, root first, the
  consumer's own node last. "Closer" means later in this sequence.
- The organisational hierarchy MAY be a DAG. **This specification
  resolves over a path, not over a graph.** A resolver MUST NOT derive a
  path by traversing a graph, and MUST NOT merge two paths.
- Every consumer MUST be bound to exactly one **designated path**. The
  binding is configuration held by the resolver or the consumer registry;
  it is never carried in the bundles, because a bundle cannot know which
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
  MUST be reflected in the context identifier (§5.5), whether or not any
  bundle changed. Drift tooling MUST flag consumers whose designated path
  changed (§10).

### 5.2 Authority-bounded resolution

Closest-wins is right for vocabulary. It is wrong for authority. An entry
is an **authority definition** if its domain is `ownership` or
`decisions`; all other definitions are **ordinary definitions**. The
domain determines the kind; authors do not label it.

**Anchoring.** An `id` is **anchored** at the bundle closest to the root,
on the resolution path, that publishes an entry with that `id`. Anchoring
is per-path and computed by the resolver from the bundles it collects in
§5 step 1. A resolver MUST compute anchoring before applying any
precedence rule.

1. For ordinary definitions sharing an `id`, the entry from the bundle
   closest to the consumer wins (§5 step 3, unchanged).
2. For authority definitions sharing an `id`, the entry from the
   **anchoring bundle** wins. A closer bundle MUST NOT shadow it, except
   under an explicit delegation.
3. A bundle MAY publish an authority definition whose `id` is not
   anchored above it. Such an entry anchors at that bundle and resolves
   normally. Closer bundles may always **add** ownership for `id`s no
   ancestor owns; they may never **take** ownership of `id`s an ancestor
   owns.
4. A resolver that encounters an unauthorised shadowing entry MUST
   discard that entry, MUST resolve the anchoring entry in its place, and
   MUST record a `resolution.unauthorised-shadow` diagnostic naming the
   discarded entry's `id` and bundle. The resolver MUST NOT fail the
   whole resolution: a leaf bundle must not be able to deny meaning to
   its siblings.
5. Resolvers MUST include unauthorised-shadow diagnostics in the
   resolution result. Validation tooling MUST treat them as errors. Drift
   tooling (§10) MUST surface them. Compilers MUST NOT emit discarded
   entries into any projection.

**Delegation.** An authority definition MAY carry a `delegates` key: a
list of node paths permitted to redefine that `id` for their own subtree.
`delegates` values are node paths in the organisational hierarchy, not
entry `id`s or references to other entries; this introduces no typed
relationship between entries.

- Delegation MUST be recorded in the **anchoring** bundle. A bundle MUST
  NOT delegate authority to itself.
- Where the anchoring entry delegates `id` `X` to node path `P`, an entry
  with `id` `X` published at `P` or below resolves for consumers at `P`
  or below, and the anchoring entry resolves for everyone else. The
  closest delegated entry wins within the delegated subtree.
- A delegated entry MUST NOT re-delegate. Delegation is one level deep;
  sub-delegation requires a further `delegates` value in the anchoring
  bundle.
- Delegation applies to the `ownership` domain only. **Decision `id`s
  MUST NOT be delegated, and a delegation naming a decision `id` MUST be
  ignored and reported.** A decision the board owns is changed by the
  board, through supersession in the anchoring bundle — never by a closer
  bundle publishing a different body under the same `id`.
- Removing a `delegates` value is a change to meaning like any other: it
  takes effect at the next resolution, and previously delegated entries
  become unauthorised shadows from that point.

This accountability delegation is distinct from the cryptographic path
delegation of §7.3. `owner` is not a key holder, and a bundle delegated
under §7.3 may carry entries whose accountability is owned further up the
tree.

**Escalation.** `org.who_owns(domain)` MUST answer from authority-bounded
resolution. The escalation path it returns MUST be built by walking
anchoring bundles towards the root, never by walking closer bundles
towards the consumer.

**Scope.** Authority definitions obey §4.2 and §5's scope rule unchanged:
a closer bundle may narrow an authority definition's scope for its subtree
and MUST NOT widen it. Narrowing scope is not shadowing and does not
require delegation.

### 5.3 Resolution failure

A **resolution error** is a condition that prevents the resolver computing
a well-defined result for some part of the tree. Resolvers MUST treat at
least the following as resolution errors:

| Code | Condition | Blast radius |
|---|---|---|
| `widening` | A closer constraint fails the narrowing test (§5 step 4) | entry `id` |
| `duplicate_id` | Two entries share an `id` within one bundle | entry `id` |
| `invalid_entry` | Missing required §4 field, a `status` outside the §4.1 ratification vocabulary, invalid `effect`, `escalate` without `route` | entry `id` |
| `invalid_action` | `action` value does not match the §4.6 grammar | entry `id` |
| `unresolvable_route` | `route` names no identifier in the ownership domain | entry `id` |
| `kind_mismatch` | The same `id` appears as a definition in one bundle and a constraint in another | entry `id` |
| `unparseable_bundle` | A bundle file cannot be parsed | bundle |
| `integrity_failure` | `org.lock` verification fails (§7) | bundle |
| `unreachable_node` | A node on the requested path cannot be loaded | request |

Implementations MAY define further codes. They MUST NOT downgrade any of
the above to a warning.

**Blast radius.** Failure MUST be scoped to the smallest unit that
contains the defect. Entry-scoped errors MUST affect only the offending
`id`; every other entry MUST resolve normally, and a resolver MUST NOT
fail the bundle, the node, or the request because one `id` is defective.
Bundle-scoped errors affect every entry originating in that bundle; the
rest of the path MUST resolve normally, and every `id` the failed bundle
contributed to MUST be marked in error. Request-scoped errors produce no
effective context at all.

**No partial context for a failed `id`.** For any `id` in error the
resolver MUST NOT emit that entry, MUST NOT emit any ancestor or
descendant version of it as though it were the resolved answer, and MUST
NOT merge parts of the contributing entries. A failed `id` resolves to an
error, never to content. Falling back to the ancestor version when a
closer version fails is the tempting behaviour and it is wrong: it
presents a rule the closer node has visibly tried to change as if the
change did not exist.

**Error reporting.** Effective context MUST carry a `resolution_errors`
list. Each element MUST carry at least `id` (or the affected bundle
identifier for bundle-scoped errors), `code`, `node`, and a human-readable
`detail`. Resolution errors are part of the resolver's deterministic
output: implementations MUST order the list by (`node`, `id`, `code`), all
compared as byte strings. Resolution errors MUST NOT be filtered by
clearance out of existence; where the affected `id` is above the
consumer's clearance the resolver MUST report the error with the `id`
withheld per §5.4, retaining `code`. A consumer must be able to learn that
something is broken above it without learning what.

**Compilers.** Where any resolution error affects entries a compiler would
emit, the compiler MUST exit non-zero, MUST report every resolution error
in its output, and MUST leave the previously generated projection
unchanged on disk. It MUST NOT emit a projection with the affected
entries omitted, and MUST NOT emit an empty or truncated projection.
Compilers MUST NOT offer a flag that emits a projection over unresolved
errors; a `--force` on this path is a hidden-deny generator.

**Gates.** Failed resolution is `deny` (§6.3). Unknown authority
escalates; refused authority denies.

### 5.4 Emission under clearance

**Verdict invariance.** For a given (context identifier, node, action) the
`verdict` returned by `org.policy` MUST be identical for every consuming
identity, regardless of clearance. Clearance MAY change the emitted
`relied_upon` set, the routes, and any accompanying text. It MUST NOT
change the verdict. A consequence worth stating: a `restricted` entry with
`effect: allow` also permits a `public` consumer's action. Confidentiality
of a rule's text is not a claim about who the rule binds; where an
organisation wants a rule to apply only to some identities, that is a
different rule, not a scope label.

**Constraints — redact the text, never the decision.** A resolver MUST NOT
remove a constraint entry from the decision set on clearance grounds.
Where a relied-upon constraint entry's `scope` is above the consuming
identity's clearance, the resolver MUST include its contribution in the
verdict; emit, in place of the entry, a **withheld marker** carrying at
minimum `withheld: true` and `reason: clearance`; and omit the entry's
`id`, body, `ref`, `action` value and `owner` from the emitted result.
Where the verdict is `escalate` and every relied-upon entry is withheld,
the response MUST still carry a usable route: implementations MUST route
to the nearest escalation target the consumer is cleared to see, and MUST
mark the route as substituted (`route_substituted: true`), so the consumer
knows it is being sent to a proxy rather than to the entry's own owner.

Withheld markers MUST have a shape that does not vary with the withheld
content: the same fields, in the same order, whatever the entry was. The
number of markers reveals how many entries were withheld; implementations
SHOULD report a count rather than repeated markers where a per-entry
marker would add nothing. At Extended conformance implementations MAY
additionally emit a deployment-stable pseudonymous handle for a withheld
entry — for example an HMAC of the `id` under a key held in the
organisation's KMS — so audit and support can correlate a withheld verdict
with an entry without disclosing it. Where emitted, the handle MUST be
stable across identities and MUST NOT be derivable to the `id` by a
consumer.

Advisory projections follow the same rule: compilers MUST emit a withheld
marker in place of a filtered constraint, and MUST NOT emit a projection
that reads as a complete set of constraints when it is not.

**Definitions — withhold whole, or mark the shadow.** Where a definition
entry that wins resolution is above the consuming identity's clearance,
the resolver MUST take exactly one of two behaviours:

- **Mode A — withhold the id.** `org.define` returns a structured miss
  with `reason: withheld`. No ancestor definition is emitted for that
  `id`. Compilers omit the entry and emit a withheld marker.
- **Mode B — marked shadow.** The nearest in-clearance ancestor version
  of the `id` is emitted, and MUST carry `superseded_by_withheld: true`.
  Consumers MUST treat a definition so marked as known-stale: agents MUST
  NOT take autonomous action that depends on it and MUST escalate to the
  entry's in-clearance escalation target.

**At Core conformance Mode A is the only conforming behaviour.** Mode B is
an Extended capability: a deployment MAY select it only at Extended, and
only by an explicit deployment-wide declaration. Where Mode B is active
the declared mode is a resolver input: it MUST be included in the context
identifier (§5.5) and MUST be stated in any conformance claim (§11).
Absent such a declaration the mode is Mode A.

Emitting an ancestor definition **without** the marker is prohibited: that
is silent shadowing. A resolver that cannot determine whether a closer
version was withheld MUST use Mode A. The mode MUST be a deployment-wide
setting, not per-identity and not per-entry: a mode that varies gives an
observer an oracle for which entries are shadowed. The same rule applies
to `org.decision` and `org.who_owns`, which are definition-domain reads.

**Errors.** Where an `id` is in error (§5.3), the error is reported to
every consumer; where the `id` itself is above clearance, the error is
reported with the `id` withheld. Clearance MUST NOT suppress the existence
of a resolution error.

### 5.5 The context identifier

- Every emitted effective context MUST carry a **context identifier**: a
  value that changes whenever any input to resolution changes.
- The identifier MUST be computed over a canonical serialisation — RFC
  8785 JCS, digested with SHA-256, as in §7.1 — of, at minimum: the
  ordered resolution path as a list of (bundle identifier, bundle
  version) pairs; the clearance labels applied (§4.2); the declared
  disclosure mode (§5.4); and the specification version the resolver
  implemented.
- A **bundle version** is the §7.1 content identifier at Core, and the
  `org.lock` version number together with the content identifier at
  Extended. Resolvers MUST NOT substitute a timestamp.
- Bundle-level values reach the identifier through the bundle version: the
  §7.1 content identifier covers the bundle metadata object, so the scope
  lattice, the grace window, the bundle identifier and entry lifecycle
  state all change it. This is what makes the "changes whenever any input
  to resolution changes" claim above hold; a resolver whose content
  identifier omits any of them does not satisfy this section.
- The identifier MUST be stable: the same inputs MUST produce the same
  identifier in every conforming resolver.
- Projections (§6.1) and gate responses (§6.3) MUST carry the context
  identifier in addition to the bundle versions they already carry. Two
  results with the same identifier were resolved from the same meaning;
  two with different identifiers MUST NOT be treated as interchangeable
  by a cache.

### 5.6 Worked example

Org policy: *customer information may be used for approved business
purposes only.* Division constraint: *claims workloads run in NZ-hosted
environments.* Repo constraint: *this agent accesses anonymised claims
data only.* The effective context for that repo's agent is all three,
conjoined. The agent never sees the tree; it sees the resolved result.

## 6. Projections

### 6.1 General rules

Compilers MUST: (1) project from resolved effective context, never raw
bundles; (2) preserve meaning — projections re-express, never
re-interpret; (3) mark every projection with the context identifier and
the bundle versions it was resolved from; (4) mark contested **and stale**
entries visibly, with the reason, in every projection; (5) label each
target **advisory** or **enforced**, where `enforced` is permitted only
under §6.4, and carry the enforcement-point declaration for any target so
labelled. Projections are generated artefacts and are never canonical.

### 6.2 Advisory targets

AGENTS.md fragments, CLAUDE.md fragments, prompt blocks, skill context,
and human handbooks are **advisory**: they inform and cannot bind.
Documentation MUST NOT claim policy is "enforced" where the verdict is not
interposed by a component the consuming agent cannot bypass (§6.4),
regardless of whether a gate is deployed. Projections emitted into
repositories (e.g. an AGENTS.md section) MUST be delimited as generated
content that tooling refreshes and humans do not hand-edit.

### 6.3 Enforced target — the gate

The gate is an MCP server exposing, at minimum:

```
org.define(term)        → canonical definition (resolved, emitted per §5.4)
org.policy(action)      → allow | escalate | deny
org.decision(topic)     → active decisions + owner (resolved, emitted per §5.4)
org.who_owns(domain)    → owner + escalation path
```

`org.policy` responses MUST be deterministic per §4.6 for a given (context
identifier, identity, action). An action not covered by any policy entry
MUST return `escalate` with `reason: uncovered`, never `allow`. Where an
entry that matches, or would match, the action is in resolution error
(§5.3), `org.policy` MUST return `deny` with `reason: resolution_error`;
it MUST NOT return `allow` or `escalate`. Unknown authority escalates;
refused authority denies. "Would match" is load-bearing: a resolver MUST
evaluate matching against the *declared* action of entries in error, so an
entry cannot be removed from the decision set by being made invalid. Where
the error prevents the action value being read at all, the affected scope
is treated as matching every action from the erring bundle's node
downward.

Gate responses MUST carry the `verdict`; a `reason` drawn from `matched`,
`uncovered`, `contested`, `resolution_error`, `stale`; the `relied_upon`
set, subject to §5.4; the `routes`, required when the verdict is
`escalate`; and the context identifier together with the bundle versions
(§5.5). Gates MUST NOT return free prose in place of a verdict, and MUST
NOT return a verdict outside the three-token vocabulary.

Gates MUST answer from effective revisions only (§4.7): an action covered
only by a `draft` or `rejected` revision is uncovered, as is an action
covered only by a retired entry (§4.1). Where a matching policy entry is
stale, the gate MUST NOT return `allow`; it MUST return `escalate` routed
to the stale entry's owner, except that a stale entry whose verdict is
`deny` MUST still return `deny` (§4.8). Where a contested entry is in the
relied-upon set, an `allow` becomes `escalate` with `reason: contested`
routed to that entry's `route` or, absent one, its `owner`; an `escalate`
remains `escalate`; a `deny` remains `deny` (§4.1).

`org.define`, `org.decision` and `org.who_owns` MUST include stale markers
and reasons in their responses, and MUST return contested entries with a
contested marker rather than withholding them: the meaning is disputed,
not absent. `org.who_owns` MUST answer from §5.2 and, for an orphaned
entry, MUST return the resolved owner of last resort (§9). A miss from
`org.define` MUST be a structured response carrying `found: false` and a
`reason` drawn from `not_defined`, `ambiguous`, `withheld`,
`resolution_error`. Gates MUST NOT synthesise, paraphrase or infer a
definition on a miss, and consumers MUST treat a miss as absence of
canonical meaning, not as licence to supply their own.

### 6.4 Enforcement and interposition

**Interposition.** A verdict is **interposed** for an action when the
verdict is obtained and applied by a component that lies in the execution
path of that action, and that the consuming agent cannot bypass, disable,
decline to invoke, or supply a forged answer to.

**Enforcement point.** The interposing component. It is not part of ORG.md
and this specification defines none; it is the deployment's own control
plane.

- A deployment MAY label a projection target `enforced` only where every
  action in that target's declared action set is interposed.
- Where any action in the target's action set is not interposed, the
  target MUST be labelled `advisory`.
- Implementations MUST NOT label a target `enforced` on the basis that a
  §6.3 gate is deployed, reachable, or configured. Availability of a
  verdict is not application of a verdict.
- A deployment claiming `enforced` MUST record, per target, an
  **enforcement-point declaration** carrying at minimum: the kind of
  enforcement point, an identifier for it, and the action set it
  interposes. Projections labelled `enforced` MUST carry this declaration
  or a reference to it.
- Where an enforcement point interposes only part of a target's action
  set, the deployment MUST either split the target or label the whole
  target `advisory`. Partial interposition MUST NOT be labelled
  `enforced` with a caveat; the label is read by machines and by
  procurement, and both read it as a whole.
- Documentation, marketing material, and generated projections MUST NOT
  describe an uninterposed gate as enforcing, preventing, blocking, or
  guaranteeing.

**What counts** (non-exhaustive): a tool-call proxy or broker through
which all of the agent's tool traffic passes, which consults the gate and
refuses denied calls; a policy enforcement point evaluating a policy
compiled from the bundle — OPA or Cedar — sited in the service the action
targets; an API gateway, service mesh filter, or network egress control
applying the compiled policy; a CI admission check or repository ruleset
that blocks a denied change, where the agent cannot merge without passing
it; a human approval step the action cannot proceed without, for actions
whose verdict is `escalate`.

**What does not count**, and MUST be labelled advisory: an MCP gate the
agent is instructed, prompted, or trained to call; a system prompt,
AGENTS.md fragment, skill, or tool description telling the agent to check
policy first; the agent's own pre-flight self-check, or framework
middleware running inside the agent's own trust boundary and disableable
from it; a gate whose verdict the agent receives while the action is
executed by a path that never sees the verdict; a linter, reviewer, or
monitor that observes after the fact — detection is valuable and is not
enforcement.

**Escalate.** For an interposed `escalate` verdict, the enforcement point
MUST suspend the action until the escalation is resolved through the
entry's `route`. An enforcement point that logs an escalation and permits
the action has applied `allow`, and the deployment MUST NOT describe that
behaviour as enforcing `escalate`.

Most real deployments will be advisory for most actions and enforced for a
few. Implementations SHOULD report **enforcement coverage** — the
proportion of an agent's action set that is interposed — as a deployment
health signal alongside the synced-to-native ratio (§4.3) and drift
findings (§10). The conformance level and the enforcement label are
independent axes: an Extended implementation that deploys the gate without
interposition remains Extended-conformant and MUST label its targets
advisory.

## 7. Integrity

§7.1 is normative at **Core**. §7.2–§7.6 are normative at **Extended** and
are additionally marked **Experimental**: they are binding on any Extended
conformance claim, but no second independent implementation has yet
validated them, so they MAY change by RFC on a shorter cycle than the rest
of §3–§6. Implementations SHOULD state the specification version their
Extended claim was tested against.

### 7.1 Bundle content identifier (Core)

Every bundle MUST have a **content identifier**: a hash over its entries
computed identically by every implementation, with no signing
infrastructure.

**Entry canonical form.** For each entry in the bundle, construct a JSON
object with exactly these members, and no others:

- `id`, `owner`, `scope`, `status`, `source` — the §4 required fields, as
  strings.
- `domain` — the semantic domain the entry was mapped to (§3), as a
  string: one of `identity`, `glossary`, `decision`, `policy`,
  `ownership`, `done`, or an implementation-mapped domain name.
- `rev` — the revision identifier.
- `revisit`, `ref`, `upstream`, `action`, `effect`, `route`, `delegates`
  — included only if present.
- `body` — the entry's Markdown body, normalised as below.

Body normalisation, applied in order: decode as UTF-8; normalise to
Unicode NFC; replace CRLF and CR with LF; strip trailing spaces and tabs
from every line; remove leading and trailing blank lines. No other
transformation is applied; the body is otherwise opaque bytes.

Unknown front-matter keys MUST NOT be included in the canonical form.
§3's ignore-unknown rule governs parsing, and the Core identifier
identifies parsed meaning, not file bytes. §7.4 governs unknown *files* in
a signed bundle and reaches the opposite conclusion for that case,
deliberately.

**Bundle metadata canonical form.** Entry canonical forms do not carry
root- and bundle-level values, yet several of those values change what
resolution produces. The governing rule: **every normative value capable
of changing resolution, disclosure, identity or authority MUST affect the
content identifier.** A bundle therefore also has a **bundle metadata
object**: a JSON object with exactly these members, and no others, each
included only where the bundle carries the value it records.

- `bundle` — the bundle identifier declared on the identity entry (§4.5),
  as a string. Omitted where no `bundle` key is present; the resolution-
  time fallback of §4.5 is not a substitute and MUST NOT be hashed here.
- `scopes` — the declared scope lattice (§4.2), as an object whose members
  are the declared labels, each mapping to the array of labels named in
  its `narrower_than`, de-duplicated and sorted ascending by byte order of
  their UTF-8 encoding. The declared edges are recorded, never the closure,
  and never the three default labels. Omitted where the bundle declares no
  `scopes:` mapping (which includes every non-root bundle, §4.2).
- `grace_days` — the grace window declared in the root `org.md` (§4.8), as
  a JSON number of whole days. Omitted where no window is declared.
- `lifecycle` — the entry lifecycle state of §4.1, as an array of objects
  with exactly the members `id` (string) and `state` (the string
  `contested` or `retired`), one per entry whose state is not the default
  — that is, one per entry carrying an active contest or a recorded
  retirement. Entries in any other state contribute nothing. Where §4.7's
  precedence gives an entry both, `retired` is recorded. The array MUST be
  sorted ascending by byte order of the UTF-8 encoding of `id`. Omitted
  where the array would be empty.

Lifecycle state is hashed here, not in the entry canonical form, because
it attaches to the entry rather than to a revision (§4.1) and MUST leave
every revision byte-identical. It belongs in the identifier because
lifecycle acts change resolution: a retired entry stops resolving (§5 step
1), and a contest changes what a consumer relying on the entry may do
(§5 step 5).

**Serialisation.** Each canonical form object — entry or bundle metadata —
MUST be serialised with the JSON Canonicalisation Scheme (RFC 8785).
Implementations MUST NOT define a local canonicalisation.

**Entry digest.** `entry_digest = SHA-256(JCS bytes)`, rendered as
lowercase hexadecimal.

**Metadata digest.** `metadata_digest = SHA-256(JCS bytes of the bundle
metadata object)`, rendered as lowercase hexadecimal. The object is always
constructed and always digested; where no member is present it is the
empty object, whose JCS serialisation is the two bytes `{}`.

**Bundle content identifier.** Sort all entries by `id`, ascending, by
byte order of the UTF-8 encoding of the `id`. Duplicate `id` values within
a single bundle MUST be a load failure, not a hash input. Build the digest
input by concatenating, in this order:

1. the UTF-8 bytes of the literal string `!bundle-metadata`, then `0x0A`,
   then the lowercase hex `metadata_digest`, then `0x0A`;
2. then, for each entry in the sort order above, the UTF-8 bytes of `id`,
   then `0x0A`, then the lowercase hex `entry_digest`, then `0x0A`.

The metadata line always comes first and is always present. It cannot
collide with an entry line: `!` is outside the `id` grammar of §4.5, so no
entry can produce a first field equal to `!bundle-metadata`. The content
identifier is `sha256:` followed by the lowercase hex SHA-256 of that
input.

The conformance suite (§11) MUST include a vector in which only bundle
metadata changes — for example one edge added to the `scopes:` lattice,
with every entry byte-identical — and MUST assert that the content
identifier changes.

Implementations MUST emit the content identifier wherever §5 and §6.1
require a bundle version, and MUST render it in full, not abbreviated.
Where §5, §6 and §12 say "bundle version", the normative value is the
content identifier at Core, and the `org.lock` version number *together
with* the content identifier at Extended.

**Effective-context canonical form.** Two conforming resolvers given the
same tree, identity, clearance and declared disclosure mode (§5.4) MUST
produce byte-identical serialised effective context. The serialisation is
a JCS-serialised JSON object with
members `entries` (the array of entry canonical forms, in the same sort
order as above, after resolution) and `bundles` (an array of objects with
`path` and `content_id`, ordered root to node). This form is the
comparison target for resolver conformance under §11.

The content identifier is an integrity and identity value only. It is not
evidence of authorship and MUST NOT be presented as such.

### 7.2 TUF profile (Extended)

`org.lock` is the **targets** metadata of a TUF repository profiled for
ORG.md. Implementations MUST implement the four TUF top-level roles:

- **root** — the trust anchor: the key sets and signature thresholds for
  all roles, and its own expiry. Root keys SHOULD be held offline in the
  organisation's key management. Root key rotation MUST follow TUF root
  rotation: a new root is accepted only when signed by a threshold of
  both the previous and the new key sets.
- **targets** — realised as `org.lock`: the entry digests and file
  digests of §7.4, the bundle's version number, and the delegations of
  §7.3.
- **snapshot** — the names and version numbers of every targets metadata
  file in the tree. Snapshot exists to bind a *set* of bundles together;
  without it an attacker can serve a current org bundle beside a stale
  team bundle and every signature verifies. Consumers MUST reject a
  resolution path whose bundle versions are not all listed by the
  currently verified snapshot.
- **timestamp** — short-lived metadata signing the snapshot's digest and
  version. Timestamp expiry SHOULD be one day or less. It is the
  freshness signal on which §7.5 depends.

Implementations MAY use Sigstore for keyless signing of targets, snapshot
and timestamp, binding signatures to OIDC identity. Keys MUST be held in
the organisation's existing key management; this specification defines no
key infrastructure of its own.

**Rollback protection.** A consumer MUST persist, per role and per bundle,
the highest metadata version number it has successfully verified. It MUST
reject any metadata whose version number is lower than the persisted
value, and MUST reject expired metadata. Metadata that fails either check
MUST be treated as a verification failure under §7.5, never as an absent
bundle.

**Verification is mandatory, not advised.** A consumer at Extended
conformance MUST verify a bundle before loading it. A bundle that fails
verification MUST NOT be loaded. A bundle that has not been verified MUST
NOT be loaded.

**What may be signed.** `org.lock` MUST cover only ratified revisions —
those whose `status` is `approved` (§4.1, §4.7). Implementations MUST NOT
sign or serve unratified revisions. This is the property that stops the standard signing injected
text.

**Reviewed writes.** Bundles MUST change only through reviewed writes.
Adapter writes are proposals into the change-review channel, not writes to
a served bundle. Direct writes to a served bundle are a conformance
failure at Extended level.

### 7.3 Path delegation (Extended)

A signature proves a bundle signed itself. It does not prove the
organisation authorised that bundle to contribute meaning. Therefore:

- The root bundle of a tree is trusted through the TUF root metadata.
- Every other bundle on a resolution path MUST be **delegated by its
  parent**. The parent's `org.lock` MUST carry a `delegations` list; each
  delegation names the child node, the key ids and signature threshold
  that authenticate it, and the `id` namespaces the child may speak for
  (glob or prefix patterns over entry `id`).
- A resolver MUST ignore, entirely, any bundle on the path that is not
  delegated by its parent — even when that bundle's own signature
  verifies. It contributes no entries, no definitions and no constraints.
- A resolver MUST ignore any entry from a delegated bundle whose `id`
  falls outside that bundle's delegated namespaces.
- Ignoring MUST NOT be silent. The resolver MUST emit a diagnostic naming
  the undelegated bundle and MUST emit an audit event (§8) where audit is
  implemented. Silent omission is indistinguishable from a bundle that
  does not exist, and would let an attacker suppress a constraint by
  breaking its delegation.
- Delegation MUST NOT widen. A delegation grants a child the ability to
  define `id`s within a namespace and to *narrow* constraints per §5; it
  can never grant the ability to widen a constraint or a scope.
- Delegation is transitive only one step at a time: a grandchild is
  reachable only if each link on the path is delegated. A parent MAY
  restrict a delegation to non-transitive (the TUF "terminating"
  analogue), in which case the child MUST NOT delegate further.

This cryptographic delegation is distinct from the accountability
delegation of §5.2.

### 7.4 Whole-directory integrity (Extended)

`org.lock` MUST list, in addition to entry digests, a `files` map from
every path in the bundle directory to its SHA-256 digest. The map MUST
cover every regular file in the directory tree except `org.lock` itself
and the detached signature files the profile defines.

At load, an implementation MUST enumerate the bundle directory. If any
file is present that the `files` map does not cover, or any digest does
not match, or any covered file is absent, verification MUST fail and the
bundle MUST NOT be loaded. Symbolic links and paths that escape the bundle
directory MUST cause verification to fail.

§3's requirement to ignore unknown files is a *parsing* rule and remains
in force at Core. At Extended it does not license loading a signed bundle
that contains content nobody signed.

### 7.5 Verification failure, revocation and the freeze horizon

Recovery is **forward only**.

- A consumer that cannot verify current metadata MUST NOT load the
  failing bundle, and MUST NOT reach for an older bundle version.
- The consumer MAY continue serving the **held context**: the effective
  context it last resolved from successfully verified metadata. Held
  context MUST be at or above the highest metadata version the consumer
  has verified, and MUST NOT be a version listed as revoked.
- **Revoked versions are never fallback targets.** An implementation MUST
  maintain the revocation state carried in verified root and targets
  metadata. A held context whose bundle version becomes revoked MUST be
  evicted immediately on learning of the revocation, with no grace period
  and no TTL wait; the consumer enters degraded mode at once.
- Every response served from held context MUST be marked as served from
  held context, with the age of the metadata it rests on. Gate responses
  MUST carry the marker alongside the context identifier, bundle versions
  and `id`s required by §6.3.
- **Freeze horizon.** An implementation MUST define a freeze horizon,
  measured from the expiry time of the most recently verified timestamp
  metadata. The default SHOULD be 7 days and MUST NOT exceed 30 days.
  Reaching the horizon means an attacker has been able to freeze this
  consumer for that long, and continued service of stale meaning is no
  longer safe.
- **Degraded mode.** Past the freeze horizon, or on eviction of revoked
  held context, the implementation MUST enter degraded mode:
  `org.policy(action)` MUST return `escalate` for every action, including
  actions a held policy would have allowed; `org.define`, `org.decision`
  and `org.who_owns` MUST either return no result or return results
  explicitly marked unverified-and-expired; already-emitted advisory
  projections MUST be regenerated with a visible expiry notice or
  withdrawn. Degraded mode MUST be reported by drift tooling (§10) and
  emitted as an audit event (§8) where those levels are implemented.
- Degraded mode MUST NOT be exited except by successful verification of
  fresh metadata. There is no operator override at Extended conformance.

Escalate-everything is a loud, safe failure. Serving stale `allow` answers
indefinitely is a quiet, unsafe one.

### 7.6 Interaction with §5

An undelegated or unverified bundle is not a lower-priority bundle: it is
**absent** from the resolution path for the purposes of §5 steps 3 and 4,
and its absence is reported. A closer bundle can therefore never win a
definition or narrow a constraint by being writable alone; it must also be
delegated.

## 8. Audit (Full conformance)

Serving implementations MUST record consumption events: identity, context
identifier, bundle versions, scope, timestamp. Events SHOULD be emitted as
OpenTelemetry-compatible events under an `org.context.*` semantic
convention namespace, to the organisation's existing monitoring. This
specification defines no log store.

Serving implementations MUST additionally emit an event per resolution
error (§5.3), carrying `code`, `id`, `node`, requesting identity, context
identifier and bundle versions; per contest or retirement recorded or
withdrawn (§4.1); per entry into degraded mode and per ignored undelegated bundle
(§7). Events SHOULD record the clearance set used rather than a single
scope, and SHOULD record whether a verdict was interposed (§6.4), so an
auditor can distinguish a consulted verdict from an applied one.

## 9. Write-doctrine (normative)

**Admission test.** An entry belongs only if a consumer acting on the
wrong version of it is expensive — in money, material risk, or meaningful
confusion. If nothing breaks when it is wrong, it MUST NOT be added.

**Never-write list.** Bundles MUST NOT contain: secrets or credentials;
personal data about individuals; personnel judgments; commercial
rationale beyond what consumers need to act (use `ref:`); speculative
strategy. Organisations SHOULD extend this list in their own `org.md`.

**Agents propose; humans ratify.** AI systems MAY draft entries, detect
gaps, and propose updates (entering as `draft` revisions). Only a human
who currently holds the entry's `owner` role may ratify a change to
`approved`. Where the entry is orphaned, only a human holding the resolved
owner of last resort may ratify, and the ratification MUST record that it
was made under fallback. Tooling MUST NOT auto-merge changes to meaning,
and holding a role is not itself ratification. This is the standard's
definition of AI-native authoring: machines are first-class participants in
proposing meaning and never in ratifying it. The same rule governs the
lifecycle acts of §4.1 — contesting and retiring an entry: agents request
them, and never perform them.

**Owners, roles, and the owner of last resort.** `owner` MUST name
exactly one accountable party, and SHOULD be a **role** identifier (e.g.
`role.editor`, `role.head-of-claims`) rather than a named individual: a
role is one accountable party, and the set of humans who hold it may
change without the entry changing. At Core a role resolves through the
`ownership` domain of the resolved bundle; at Extended roles MUST resolve
to the organisation's identity system (§4.2), never to a parallel list of
people in the bundle. A role is **empty** when it resolves to no current
holder; an entry whose owner is an empty role, or a named individual who
no longer exists in the identity system, is **orphaned**, and orphaned
entries are stale (§4.8).

**What Core binds, and what it does not.** At Core an implementation
validates organisational semantics only: that `owner` names a role, and
that the role resolves in the `ownership` domain of the resolved bundle. It
does not, and at Core cannot, verify that the human performing a
ratification currently holds that role, because nothing at Core binds a
human identity to a role identifier. **Identity-backed ratification** — the
verified guarantee that the ratifier holds the entry's `owner` role — is an
**Extended** guarantee, delivered by resolving roles to the organisation's
identity system per §4.2. A Core implementation MUST NOT claim it. This
adds no data to bundles: role membership lives in the IdP, never in a
parallel list of people alongside the meaning it governs.

- Every bundle MUST be able to name an owner of last resort. The **root**
  bundle MUST declare one, as an ownership entry with `id:
  own.last-resort`. Non-root bundles MAY declare one for their subtree.
- Where a bundle declares no owner of last resort, its owner of last
  resort is that of the nearest ancestor bundle that declares one.
  Resolution therefore always terminates at the root.
- `own.last-resort` is an authority definition and resolves under §5.2: a
  closer bundle MUST NOT shadow an ancestor's owner of last resort
  without delegation recorded in the anchoring bundle.
- Where an entry is orphaned, accountability for it escalates to the
  nearest declared owner of last resort on the path. That party MAY
  ratify changes to the entry, including reassigning its `owner`, and
  MUST be the escalation target returned by `org.who_owns` for that
  entry. This is the only path by which someone other than the named
  owner ratifies, and it opens only when the named owner cannot be
  resolved.
- Escalation to an owner of last resort MUST be recorded in the ratifying
  revision, so an audit shows the entry was ratified under fallback and
  not by its stated owner.

## 10. Maintenance and drift

Organisations change continuously, so this standard treats **drift** as a
first-class concern rather than relying on people remembering to edit.

Implementations SHOULD detect and flag at least:

- entries past `revisit`, and constraint or decision entries with no
  `revisit` at all (§4.8);
- entries whose `owner` no longer resolves to a current holder (e.g. via
  HR/IdP sync), and the fallback owner each would escalate to (§9);
- entries in **pending** — an unratified draft revision above the
  approved one — and drafts that diverge from one another (§4.7);
- entries in **orphaned-upstream** — a `synced:` entry whose upstream
  changed or disappeared (§4.7);
- unauthorised-shadow diagnostics from §5.2, and undelegated-bundle
  diagnostics from §7.3;
- consumers whose designated path changed since their last resolution,
  which changes effective context without changing any bundle (§5.1);
- repeated agent escalations on the same ambiguity, which indicate
  *missing* meaning, and a high or growing count of contested entries.

The intended lifecycle: reality changes → drift detected → update
proposed (often by tooling, as a `draft` revision) → owner ratifies →
conformance tests run → projections regenerate → consumers receive new
meaning at their next resolution.

## 11. Conformance levels

| Level | Requirements |
|---|---|
| **Core** | §3–§6.2: bundle layout, §3.1 grammar, entry model, §4.5 identity, §4.6 field and grammar validation, §4.7 revision selection by ratification
state together with the §4.1 entry lifecycle states, §5.1 designated path, §5.2 authority-bounded resolution, §5.3 failure semantics, §5.4 emission under clearance with disclosure Mode A, §7.1 content identifier, `revisit` validation and stale marking in advisory projections, and a root `own.last-resort`. Core implementations MUST NOT claim deterministic policy answers, and MUST NOT claim identity-backed ratification (§9). **Adopting** a Core bundle — authoring the entries and resolving them with conformant tooling — is achievable by a small org in an afternoon. **Implementing** a Core-conformant resolver is not an afternoon's work, and this level makes no such claim. |
| **Extended** | Core + §6.3 gate with deterministic verdicts per §4.6, escalate-on-stale, §6.4 enforcement labelling, and §7.2–§7.6 integrity (Experimental, §7) — `org.lock` over approved revisions only — with scopes and roles resolved to the organisation's identity system, which is what makes identity-backed ratification (§9) available. Disclosure Mode B (§5.4) MAY be selected only here, and only by explicit declaration. |
| **Full** | Extended + §8 audit + §10 drift tooling, including unratified-delta and orphan-drift surfacing, fallback-ratification records, and contested-workflow support with the §4.1 authority restriction and lifecycle-act records. |

**Conformance and benchmark scores are different claims.**

- **Conformance** is a claim about a deterministic implementation: a
  resolver, a compiler, or a gate. It means passing the published
  conformance suite for the claimed level.
- A **benchmark score** measures a consumer — an agent, model or agent
  product — behaving under resolved effective context. It is a number
  with conditions attached, and never a conformance claim.

1. Conformance MUST be claimed only for a resolver, compiler or gate
   implementation, at a named level, against a named version of the
   conformance suite — "Core-conformant (conformance suite 1.2)".
2. The conformance suite MUST consist only of deterministic tests: tests
   whose expected results are fixed values, computed without a language
   model in the evaluation path. A test whose outcome depends on model
   choice, model version, sampling parameters or prompt phrasing MUST NOT
   be part of the conformance suite.
3. Resolver conformance MUST be evaluated by comparison against the
   canonical effective-context serialisation (§7.1): byte-identical
   output for the same tree, identity, clearance and declared disclosure
   mode (§5.4). At Core the mode is fixed to Mode A and the tuple is
   (tree, identity, clearance); a claim covering Mode B is an Extended
   claim and MUST state the declared mode.
4. Compiler conformance MUST be evaluated by byte-identical projection
   output for identical resolved input, together with the §6.1 rules.
5. Gate conformance MUST be evaluated by determinism of `org.policy` over
   a fixed (context identifier, identity, action) tuple, and by the
   uncovered-action rule (`escalate`, never `allow`).
6. Agent behaviour under resolved context MUST be reported as an Org
   Context Bench score. A score report MUST state: the suite version, the
   model identifier and version, the sampling parameters, the harness or
   product version, the date of the run, and the number of repetitions
   with dispersion across them. A single-run score without dispersion
   MUST NOT be published as a bench result.
7. No agent, model, or agent product may be described as "ORG.md
   conformant", "conforms to ORG.md", or any equivalent. Such a product
   MAY be described as scoring a stated value on a stated version of the
   Org Context Bench. Consuming an ORG.md projection is an integration,
   not a conformance level.
8. A product that both ships a resolver and consumes context MAY claim
   conformance for its resolver and report a score for its agent
   behaviour, and MUST keep the two claims visibly separate.

The suite remains authoritative for behaviour it covers. Where the suite
is silent, the normative prose of this specification governs. Where they
conflict, file an issue; an RFC resolves it. The conformance suite MUST be
versioned independently of this specification and MUST be releasable
incrementally: an implementation MAY claim conformance against any
published suite version, and the claim carries the coverage of that
version and no more. A suite version MUST publish its coverage — which
sections of §3–§8 it tests and which it does not.

## 12. Versioning

This specification uses semantic versioning; everything before 1.0.0 may
change via RFC. At 1.0.0 the formats and semantics in §3–§6 freeze;
additions come as optional capabilities. At Core, a bundle's version is
its §7.1 content identifier; `org.lock` adds a monotonic version number at
Extended. Projections carry the context identifier and the versions they
were resolved from.

---

## Appendix A — minimal conformant bundle

```
org/
├── org.md          (identity: Kōwhai Freight Ltd; tone: plain, direct)
├── ownership.md    (one entry: own.last-resort)
└── glossary.md     (one entry: term.consignment)
```

This three-file bundle is Core-conformant. A root bundle MUST declare an
owner of last resort (§9), which is the only addition 0.3 makes to the
minimal shape. Everything else in this specification is what it can grow
into.
