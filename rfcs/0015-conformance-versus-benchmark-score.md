# RFC 0015 — Conformance is for resolvers; agent behaviour is a benchmark score

- **Status:** draft
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#15

## Motivation

§11 defines conformance as passing the Org Context Bench suite, and says
the suite covers two things: **resolvers** (do independent
implementations produce identical effective context?) and **agents**
(does the consumer apply resolved meaning correctly?). DEC-0003 makes
that definition binding: the suite is the spec.

The two halves are not the same kind of thing.

Resolver behaviour is deterministic. Given a tree, an identity and a
clearance, there is one correct effective context, and two
implementations either agree or they do not. A test either passes or
fails, today, on a laptop, with no model in the loop.

Agent behaviour is not. The same agent, on the same task, with the same
resolved context, gives different answers across models, model versions,
temperatures, system prompts and harnesses. ROADMAP Hypothesis F is the
project's own statement that this may not be measurable at all: its kill
signal is "behavioural tests prove too model-dependent or subjective to
compare". The project has published, in advance, the possibility that
half of its conformance definition cannot be built.

Two consequences follow, both bad.

**The deterministic half is hostage to the non-deterministic half.** If
agent tests are unstable — and they will be, at least at the margins —
then a single "conformance" verdict built from both is unstable. A
resolver author who wrote a correct resolver has no way to say so
without their claim being entangled with a score that moves when a
vendor ships a new checkpoint.

**Nothing can claim conformance until v0.7.** The suite is scheduled for
v0.7. DEC-0003 says conformance *is* the suite. So between now and v0.7
there is no conformant implementation of ORG.md, including the reference
one, and no adopter can state what they have built. That is a real
adoption cost for a standard whose Core level is meant to be reachable
in an afternoon.

There is a second, separate gap in the same area. The specification leans
hard on adapters: §4.3 says bundles "are intended to be mostly synced",
and that ORG.md is an interchange format, "not a new place to write". If
that is false — if in practice bundles fill up with hand-authored
`native` entries because adapters are too costly to build and too brittle
to keep — then ORG.md is a wiki with front-matter, and the write-doctrine
in §9 is doing all the work. This is load-bearing and it is untested:
Hypotheses A–G cover value, drift, enforcement, neutrality, measurability
and scale, and none covers adapter viability.

## Design

### Part 1 — split §11

The conformance paragraph of §11 is replaced. The level table is
unchanged.

**Definitions.**

- **Conformance** is a claim about a deterministic implementation: a
  resolver, a compiler, or a gate. It means passing the published
  conformance suite for the claimed level.
- **Benchmark score** is a measurement of a consumer — an agent, model or
  agent product — behaving under resolved effective context. It is a
  number with conditions attached. It is never a conformance claim.

**Normative rules.**

1. Conformance MUST be claimed only for a resolver, compiler or gate
   implementation, at a named level (Core, Extended, Full), against a
   named version of the conformance suite. A conformance claim MUST state
   the suite version — "Core-conformant (conformance suite 1.2)".
2. The conformance suite MUST consist only of deterministic tests: tests
   whose expected results are fixed values, computed without a language
   model in the evaluation path. A test whose outcome depends on model
   choice, model version, sampling parameters or prompt phrasing MUST NOT
   be part of the conformance suite.
3. Resolver conformance MUST be evaluated by comparison against the
   canonical effective-context serialisation (RFC 0014 §7.1). Two
   conforming resolvers given the same tree, identity and clearance MUST
   produce byte-identical output in that form.
4. Compiler conformance MUST be evaluated by byte-identical projection
   output for identical resolved input, together with the §6.1 rules
   (contested marking, version marking, advisory/enforced labelling,
   scope filtering).
5. Gate conformance MUST be evaluated by determinism of `org.policy` over
   a fixed (bundle versions, identity, action) tuple, and by the
   unknown-action rule (`escalate`, never `allow`).
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

**Where prose and suite disagree.** DEC-0003 is refined, not withdrawn.
The suite remains authoritative for behaviour it covers. Where the suite
is silent, the normative prose of this specification governs. Where they
conflict, file an issue; an RFC resolves it. This removes the reading
under which uncovered behaviour is unconstrained.

**Conformance before the suite is complete.** The conformance suite MUST
be versioned independently of the specification and MUST be releasable
incrementally. An implementation MAY claim conformance against any
published suite version, and the claim carries the coverage of that
version and no more. A suite version MUST publish its coverage: which
sections of §3–§8 it tests and which it does not. This unblocks
conformance claims from the first suite release rather than from suite
completeness.

### Part 2 — Hypothesis H (ROADMAP)

Add to the hypothesis table:

| # | Hypothesis | Kill signal |
|---|---|---|
| H | Adapters are viable: most meaning in a maintained bundle can be kept current by adapters from existing systems of record, rather than hand-authored | At v0.7, dogfood and adopter bundles are still more than 80% `source: native`, or no adapter survives an upstream schema change without hand-editing |

Add to v0.5, under `orgmd doctor`: doctor MUST report the
synced-to-native ratio for every bundle it inspects, as a count and a
percentage, broken down by domain. §4.3 already says tooling SHOULD
surface this as a health signal; from v0.5 it is a tracked number rather
than an aspiration, and it is the measurement that decides Hypothesis H.

Add to v0.7, alongside the bench: publish the synced-to-native ratio for
every dogfood and adopter bundle, and evaluate Hypothesis H against the
kill signal.

Add to the v0.7 gate: if Hypothesis H fails, the conclusion is that
ORG.md is a small authoring format rather than an interchange layer, and
§4.3's "mostly synced" claim must be withdrawn or the adapter story
funded properly. Either way the ROADMAP must say which.

## Alternatives considered

**Do nothing.** Resolver conformance stays coupled to a measurement the
project has already published as possibly unmeasurable, and no
implementation can claim anything before v0.7. The specific failure mode:
the first independent resolver — a v1.0 criterion — arrives, passes every
deterministic test, and cannot be called conformant because the agent
half of the suite is not ready or is not stable.

**Keep one suite, but weight agent tests as advisory.** Less disruptive.
Rejected because "advisory tests inside a conformance suite" is a
contradiction that will be resolved in marketing copy rather than in the
spec. If a test cannot fail a claim, it is not a conformance test, and
calling it one invites exactly the "ORG.md conformant agent" claim rule 7
forbids.

**Define agent conformance with a threshold score.** For example, 80% on
the bench is "conformant". Rejected: the threshold would be arbitrary,
would move with model releases, and would let a vendor claim conformance
on a checkpoint that no longer exists. It also fails Hypothesis F's own
kill signal — if scores are not comparable across models, a threshold
across models is meaningless.

**Delay the split until the suite exists and its stability is known.**
Rejected on cost. The choice determines how the suite is built; making it
after v0.7 means rebuilding the suite and retracting claims made under
the old definition.

**Drop agent measurement entirely.** Rejected. Meaning-fidelity
measurement is the point of Hypothesis A and the bench is the project's
distribution engine (ROADMAP v0.7). The problem is not measuring agents;
it is calling the measurement conformance.

**Put adapter viability inside Hypothesis E or G rather than adding H.**
Rejected: E is about platform neutrality of the format and G about
scale-independence of the semantics. Neither would be killed by adapters
proving unbuildable, so neither tests it.

## Conformance impact

The level table (Core, Extended, Full) is unchanged. What changes is who
may claim a level and how the claim is evidenced.

- The suite splits into a **conformance suite** (deterministic;
  resolvers, compilers, gates) and the **Org Context Bench** (agent
  scores). ROADMAP v0.7 currently lists both under one milestone; the
  conformance suite's first version SHOULD ship at v0.5 alongside the
  reference resolver, since its tests need no model.
- Existing tests that compare effective context, projection bytes, and
  gate answers move to the conformance suite unchanged.
- Existing and planned agent tasks — including the 120-task Kōwhai
  Freight suite and the leakage checks — move to the bench and produce
  scores, not pass/fail.
- New conformance tests: suite-version and coverage reporting; claim
  strings that name a suite version.
- New bench requirements: every published result carries the disclosure
  set in rule 6, and multi-run dispersion.
- v1.0 criterion 2 ("an independent resolver that matches the reference
  on the conformance suite") is now satisfiable against the conformance
  suite alone. v1.0 criterion 5 (Hypotheses A, C, D, F standing) is
  unaffected, and gains H as a tracked hypothesis; whether H joins the
  v1.0 criteria is left to the editor.

## Constitution check

**This RFC proposes a constitutional clarification. It is marked as such
under GOVERNANCE.md.**

**Principle 10** currently reads: "Conformance is behavioural, not
syntactic — for consumers and for resolvers." Part 1 removes consumers
from conformance, so the principle as written is touched and cannot be
left alone. This RFC proposes replacing it with:

> 10. Conformance is behavioural, not syntactic. For resolvers,
>     compilers and gates it is a pass/fail claim against the published
>     conformance suite. Consumer behaviour under resolved context is
>     measured and reported as a benchmark score, never claimed as
>     conformance.

The clarification preserves the principle's substance — conformance is
never "the file parses" — while removing the category error of applying
a pass/fail claim to a non-deterministic subject. It narrows the reach of
the word "conformance" and widens nothing, so it is a clarification
rather than a substantive amendment; the editor may nonetheless treat it
as an amendment and it is presented for that decision explicitly.

**Principle 6 — security primitives are borrowed, never rebuilt.** Not
touched. No mechanism changes; the disclosure requirements in rule 6
follow existing benchmark-reporting practice rather than inventing a
methodology.

**Principle 1 — humans and machines are first-class consumers of
meaning.** Not touched. Agents remain first-class consumers. They are
measured rather than certified, which is a statement about what can be
tested, not about standing.

**DEC-0003 — "the suite is the spec".** DEC-0003 is a seed *decision*,
not a principle. An RFC may refine a decision without a constitutional
amendment; that is what the RFC process in GOVERNANCE.md exists for. This
RFC proposes that the decision entry created on acceptance refine
DEC-0003 in three respects: the suite is split into a conformance suite
and a benchmark; conformance attaches only to the deterministic suite;
and where the suite is silent, the prose governs. DEC-0003's own status
SHOULD then move to `superseded` (§4.1) with the new decision as its
successor, retained for history. The refinement is recorded in the
decision entry, not by editing DEC-0003's text in place.

**ROADMAP changes** carry no constitutional weight; Hypothesis H is added
by the same mechanism as A–G.

## Decision

Filled by the editor. A `decisions/DEC-NNNN.md` entry is created on
accept or reject.
