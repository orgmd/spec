# ORG.md Roadmap

Sequencing principle: **idea → evidence → hardening**, with a kill-gate at
each stage. This is a nights-and-weekends project run by one maintainer;
the gates exist so it dies cheaply if it deserves to. The launch is framed
as an **open experiment**: the hypotheses below are published with their
kill signals, and the project's credibility comes from testing them in
public rather than asserting a finished standard.

## The hypotheses (and what kills them)

| # | Hypothesis | Kill signal |
|---|---|---|
| A | A small amount of high-value organisational meaning materially improves agent behaviour | Improvement is negligible without encoding enormous volumes |
| B | Meaning drift causes material enterprise AI errors | Observed failures trace overwhelmingly to models, data, permissions or workflow — not semantics |
| C | Distributed owners ratify changes when drift is surfaced intelligently | Flagged drift rots at the same rate as stale wiki content |
| D | Advisory context alone produces meaningful benefit | Behaviour only improves under hard runtime enforcement |
| E | The canonical format stays platform-neutral | Major platforms require fundamentally different semantic representations |
| F | Meaning-fidelity can be measured reliably | Behavioural tests prove too model-dependent or subjective to compare |
| G | One core format serves a ten-person shop and a bank | Regulated enterprises need different *semantics*, not just stronger governance |
| H | Adapters are viable: most meaning in a maintained bundle can be kept current by adapters from existing systems of record, rather than hand-authored | At v0.7, dogfood and adopter bundles are still more than 80% `source: native`, or no adapter survives an upstream schema change without hand-editing |

## v0.4 — publish the experiment *(weeks 1–3)*

Done:

- [x] SPEC.md 0.2-draft published (this repo) — since superseded by
      0.3-draft
- [x] Hypotheses A–G and kill signals published alongside it
- [x] Launch site live (existing mockup, promoted to front door)

In progress:

- [ ] Naming essay, framed as an open experiment

Planned:

- [ ] Launch: HN, LinkedIn, agent-ecosystem communities

**Gate: does anyone care?** One organisation that isn't the maintainer's
opening issues or drafting a bundle. No signal → park it. Cost so far:
weeks, not months.

## v0.5 — reference implementation *(weeks 3–6)*

- [x] `orgmd init` — interview-style scaffold
- [x] **Reference resolver** — effective context per §5, with the
      definition/constraint split; this is the trusted base, so it gets
      tests before features
- [x] `orgmd compile` — two advisory targets: AGENTS.md fragment +
      prompt block (deterministic, zero inference cost)
- [x] `orgmd adopt` — importer drafting a bundle from existing
      CLAUDE.md / AGENTS.md / wiki exports (nobody starts from blank)
- [x] `orgmd doctor` — computed staleness: revisit dates, orphaned
      owners, upstream drift; and the **synced-to-native ratio for every
      bundle** it inspects, as a count and a percentage, broken down by
      domain (SPEC §4.3 makes this a health signal; from v0.5 it is a
      tracked number, and it is the measurement that decides Hypothesis H)
- [x] **First conformance-suite release** (deterministic resolver
      vectors) — ships with the reference resolver, not waiting for v0.7
- [x] Entry front-matter published as a **JSON Schema** — free
      validation in every editor and CI system from day one
- [ ] Dogfood: two real public bundles (BoundFor, FieldReport) — source and
      owner review are external and remain outstanding.

## v0.6 — the MVE *(the evidence milestone)*

One organisation, one meaning-dense capability (architecture review is
the model case). 20–50 entries. Then measure:

- [ ] **Baseline** — how agents perform today
- [ ] **Advisory** — same tasks with resolved context supplied
      (tests Hypotheses A, D)
- [ ] **Gate** — risky actions enforced (tests the enforcement delta)
- [ ] **Drift experiment** — change one entry: is it detected, proposed,
      ratified, regenerated, and caught by conformance tests?
      (tests Hypothesis C)
- [ ] Collect real incident evidence for Hypothesis B along the way

**Gate: Hypotheses A and D survive.** If advisory context moves nothing
and only enforcement helps, the product is a policy gate, not a meaning
standard — a different (smaller) project.

## v0.7 — the bench goes public *(the attention milestone)*

- [ ] MVE tasks generalised into the 120-task Kōwhai Freight suite —
      **the bench**: agent scores, not pass/fail (SPEC §11)
- [ ] **Conformance suite** grown to cover resolvers, compilers and gates
      (two implementations, byte-identical effective context)
- [ ] Real leaderboard — a **bench** artefact: three agents minimum,
      scores published with the full disclosure set
- [ ] Publish the synced-to-native ratio for every dogfood and adopter
      bundle; evaluate Hypothesis H against its kill signal
- [ ] Results post + directory submissions + lab DevRel outreach

**Gate: does it travel?** Citations, reposts, or one lab conversation.
The bench is the distribution engine; if it doesn't move, breadth won't
save it. **And: if Hypothesis H fails**, ORG.md is a small authoring
format rather than an interchange layer — either withdraw SPEC §4.3's
mostly-synced claim or fund the adapter story properly. Either way this
roadmap must say which.

## v0.8–0.9 — harden what users actually hit

Driven by issues, not imagination: MCP gate reference server (unknown →
`escalate`); gate compile targets for **OPA/Rego and Cedar**, so
enforcement rides policy engines security teams already run; scopes with Extended IdP resolution behind an interface;
hash-based `org.lock`, proper signing and revocation when someone needs
it; leakage checks in the bench (does a public-scope agent reveal
internal entries under pressure?); first two adapters, chosen by
whichever systems real adopters name. Explicitly resisted until asked
for: enterprise features, dashboards, hosted anything.

## v1.0 — criteria, not a date *(realistically ~Q2 2027)*

1. Spec frozen under semver
2. At least one implementation the maintainer didn't write — including
   an independent resolver that matches the reference on the
   conformance suite
3. Three organisations running bundles in anger
4. Bench covering 5+ agents, with leakage checks
5. Hypotheses A, C, D and F standing with published evidence
6. Documented migration path from every 0.x

## Beyond v1 — three tracks

**Governance** — propose contribution to the Agentic AI Foundation
(Linux Foundation), alongside AGENTS.md and MCP. Commoditisation is the
victory condition; donation converts the maintainer from tool author to
standard author.

**Ecosystem & revenue** *(only after pull, always light-touch)* —
**semantic-diff tooling** ("what behaviour changes because this text
changed?" with affected skills/agents/repos — likely the highest-value
capability around the standard); hosted registry; drift-detection
connectors; "Org Context Ready" certification for agent vendors; industry
packs (banking, utilities, government, healthcare, aviation); the
consulting funnel throughout.

**v2 themes** — per-task dynamic resolution, and the genuinely novel
horizon: **federated meaning across organisational boundaries** (an org
sharing scoped context with its suppliers, carriers, or regulators).
Nobody is within sight of that one.
