# ORG.md

**An open standard for the organisational meaning layer.**

Write down what your organisation means — its words, rules, decisions and
owners — once. ORG.md defines the portable contract; conformant tooling
keeps that meaning current, resolves it by scope, and projects the
applicable context to every AI tool and every person.

> Repo-level context is standardised (AGENTS.md). Agent protocols are
> standardised (MCP, A2A). The layer above them — what your organisation
> actually *means*, organisation-wide — has no widely adopted portable
> standard. This is that layer.

**Status: 0.3-draft — seeking feedback.** Nothing here is frozen. If you
run agents in an organisation and this problem is yours, we want your
issues, your counterexamples, and your bundle.

## The problem in one table

One fact, as five surfaces at one company currently hold it:

| Surface | What it says | Result |
|---|---|---|
| eng repo · CLAUDE.md | "consignment: another word for shipment" | wrong data model ships |
| customer bot · prompt | "estimate delivery times when asked" | promises ops can't keep |
| warehouse agent · config | *(no definitions)* | agent improvises at 2am |
| wiki · edited 2024 | "we prioritise rail" | superseded decision, still read |
| the product owner's head | correct, current | unavailable at scale |

Between people this cost confusion. Agents build on stale meaning at
machine speed — misalignment now ships before lunch, on every surface at
once.

## What ORG.md does

One small, git-versioned bundle:

```
org/
├── org.md          # identity, mission, tone
├── glossary.md     # ubiquitous language
├── decisions/      # active decisions, with owners
├── policies.md     # what agents may / must not do
├── ownership.md    # who decides what; escalation map
├── done.md         # definitions of done
└── org.lock        # signed manifest
```

…compiled into scope-filtered projections for every audience:

- **AGENTS.md / CLAUDE.md fragments** → coding agents *(advisory)*
- **System prompt blocks** → direct model users *(advisory)*
- **MCP gate** → autonomous agents: `org.policy(action) → allow | escalate | deny` *(deterministic; **enforced** only where interposed — SPEC §6.4)*
- **Handbook** → humans

Three design commitments carry the whole thing:

1. **Canonical by exception** — entries sync *from* your existing systems
   of record; the bundle is an interchange format, not another wiki.
2. **Small on purpose** — an entry earns its place only if an agent
   getting it wrong is expensive (see the write-doctrine, SPEC §9).
3. **Borrow, never build** — scopes resolve to your IdP, keys sit in your
   KMS, audit flows to your SIEM. ORG.md owns a format, a compiler, and a
   bench. Nothing else.

## Layers and scale

A two-person company runs one bundle. A larger organisation — board,
exec, business units, teams — gives each layer its own, and every
consumer resolves down one designated path of the tree (SPEC §5). Three
kinds of meaning travel by three different rules:

| Kind | Across layers | So that |
|---|---|---|
| Vocabulary, definitions of done | closest to the consumer wins | teams may speak their own language, locally |
| Policies | all apply; a closer layer may only narrow (SPEC §5, §4.6) | no subtree can weaken a rule from above |
| Decisions, ownership | the anchoring bundle — closest to the root — wins (SPEC §5.2) | a team cannot rewrite a board decision; delegation is explicit, and never for decisions |

This is also why the registers stay small at scale: mass is distributed —
each layer holds only the meaning it owns — and the write-doctrine admits
an entry only where a consumer acting on the wrong version is expensive
(SPEC §9). The decision register holds *active* decisions only
(superseded entries are kept but never emitted), and full rationale stays
in your systems of record via `ref:` or `synced:` sources. Start as one
bundle; split a layer out only when it needs to own its own meaning — the
narrowing and anchoring rules make each split safe by construction.

## Quickstart

The reference CLI ships at v0.5 (see [ROADMAP.md](./ROADMAP.md)); the
commands below are its target interface, not a released package:

```text
orgmd init          # scaffold a bundle, interview-style
orgmd compile --all # emit every projection
orgmd doctor        # find stale, orphaned, or drifted entries
orgmd serve --mcp   # mount the gate (advisory unless interposed)
```

A three-file bundle — identity, an owner of last resort, and one meaning
file — is fully Core-conformant. Start with the ~20 terms your org argues
about and one policy your agents must not break.

## Repository map

| Doc | What it is |
|---|---|
| [SPEC.md](./SPEC.md) | The normative specification (0.3-draft) |
| [ROADMAP.md](./ROADMAP.md) | Path to v1.0 and beyond, with kill-gates |
| [GOVERNANCE.md](./GOVERNANCE.md) | How decisions get made (spoiler: with ORG.md) |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute, per repo |
| [SECURITY.md](./SECURITY.md) | Threat model and disclosure |
| [NON-GOALS.md](./NON-GOALS.md) | What this will never be |
| [AGENT-BRIEF.md](./AGENT-BRIEF.md) | The build sequence for the reference implementation |
| [org/](./org/) | This project's own bundle — governance, dogfooded |
| [site/](./site/) | The launch one-pager and logo assets |
| [rfcs/](./rfcs/) | Spec change proposals (template inside) |

## Prior art

ORG.md stands on solved problems and says so. The trajectory it copies is
**OpenAPI** and **MCP**: spec plus tooling plus reference implementations,
donated to neutral governance at traction. The components it profiles
rather than reinvents: **TUF/Sigstore** for signed manifests and
revocation, **JSON Schema** for entry validation, **ADR/MADR** for
decision records, **OPA/Cedar** as gate compile targets, **OpenTelemetry**
for audit events, and optionally **SKOS** for glossary interop. Normative
prose defines the contract, deterministic conformance tests demonstrate
that implementations agree on it, and agent behaviour is benchmarked
separately (SPEC §11); the format stays boring-small, per robots.txt.

The ancestor it learns from is the **Semantic Web**. RDF and OWL attacked
this exact problem with far more formal power, and ORG.md deliberately
trades that expressiveness away for authoring cost: formal ontology asks
domain experts to author like logicians, wants meaning globally
consistent, and was built for machine consumers that hadn't arrived yet.
ORG.md takes the other side of each trade — LLMs read prose, so domain
owners write meaning directly; truth is local and `contested` is a legal
state; and the agents arrived first this time.
The never-write list and the no-ontology rule (NON-GOALS #9) are the
guardrails against sliding back down that hill.

## Licensing

Specification text: **CC BY 4.0**. Reference implementations (`orgmd`
CLI, gate, bench): **Apache-2.0**. Contributions via DCO sign-off.

## The bench

The Org Context Bench measures whether an agent, given a scoped bundle,
uses the vocabulary correctly, respects the policies, and routes
escalations to the right owner — published per agent, as a score with its
conditions attached. It is not a conformance claim: **conformance** is a
separate, deterministic suite for resolvers, compilers and gates, which
also serves as CI for your own bundle changes (SPEC §11).

---

Made in New Zealand. Meaning, finally treated as infrastructure.
