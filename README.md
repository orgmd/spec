# ORG.md

**An open standard for the organisational meaning layer.**

Write down what your organisation means — its words, rules, decisions and
owners — once. ORG.md keeps it current, controls who sees what, and
delivers the right version to every AI tool and every person automatically.

> Repo-level context is standardised (AGENTS.md). Agent protocols are
> standardised (MCP, A2A). The layer above them — what your organisation
> actually *means* — is not. This is that layer.

**Status: 0.2-draft — seeking feedback.** Nothing here is frozen. If you
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
- **MCP gate** → autonomous agents: `org.policy(action) → allow | escalate | deny` *(enforced, deterministic)*
- **Handbook** → humans

Three design commitments carry the whole thing:

1. **Canonical by exception** — entries sync *from* your existing systems
   of record; the bundle is an interchange format, not another wiki.
2. **Small on purpose** — an entry earns its place only if an agent
   getting it wrong is expensive (see the write-doctrine, SPEC §9).
3. **Borrow, never build** — scopes resolve to your IdP, keys sit in your
   KMS, audit flows to your SIEM. ORG.md owns a format, a compiler, and a
   bench. Nothing else.

## Quickstart

The reference CLI ships at v0.5 (see [ROADMAP.md](./ROADMAP.md)); the
commands below are its target interface, not a released package:

```text
orgmd init          # scaffold a bundle, interview-style
orgmd compile --all # emit every projection
orgmd doctor        # find stale, orphaned, or drifted entries
orgmd serve --mcp   # mount the enforcing gate
```

A two-file bundle is fully Core-conformant. Start with the ~20 terms your
org argues about and one policy your agents must not break.

## Repository map

| Doc | What it is |
|---|---|
| [SPEC.md](./SPEC.md) | The normative specification (0.2-draft) |
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
for audit events, and optionally **SKOS** for glossary interop. The test
suite *is* the standard, per JSON Schema; the format stays boring-small,
per robots.txt.

The ancestor it learns from is the **Semantic Web**. RDF and OWL attacked
this exact problem with more formal power and failed in organisations:
authoring required logicians, meaning had to be globally consistent, and
the machine consumers didn't exist yet. ORG.md inverts each condition —
LLMs read prose, so domain owners write meaning directly; truth is local
and `contested` is a legal state; and the agents arrived first this time.
The never-write list and the no-ontology rule (NON-GOALS #9) are the
guardrails against sliding back down that hill.

## Licensing

Specification text: **CC BY 4.0**. Reference implementations (`orgmd`
CLI, gate, bench): **Apache-2.0**. Contributions via DCO sign-off.

## The bench

The Org Context Bench measures whether an agent, given a scoped bundle,
uses the vocabulary correctly, respects the policies, and routes
escalations to the right owner — published per agent. It doubles as the
conformance suite and as CI for your own bundle changes.

---

Made in New Zealand. Meaning, finally treated as infrastructure.
