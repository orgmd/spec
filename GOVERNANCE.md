# Governance

This project is governed **with its own format**. The repository carries a
bundle: a `decisions/` log, an `ownership.md`, and a glossary. Every
governance question below is answered by an entry you can read, diff, and
dispute. If ORG.md is not good enough to run ORG.md, it is not good enough
to ship.

## Roles

- **Editor (BDFL until v1.0):** Matt. The editor decides spec RFCs,
  holds release keys, and is the owner of last resort for contested
  entries. This concentration is deliberate and temporary — see DEC-0002.
- **Maintainers:** commit rights on the tooling and bench repos, earned
  through sustained contribution. Maintainers do not decide spec changes.
- **Contributors:** anyone, via DCO-signed pull requests.

## Three repos, three bars

| Repo | Velocity | How change happens |
|---|---|---|
| `spec` | Deliberately slow | RFC process only (below) |
| `orgmd` (tooling) | Normal OSS | PR + one maintainer review |
| `bench` | Most open | PR + CI green; lab-submitted tasks especially welcome |

## The RFC process (spec changes)

1. **Issue** — name the problem, not the solution
2. **Discussion** — in the open, on the issue
3. **RFC document** — a PR adding `rfcs/NNNN-title.md`: motivation,
   design, alternatives considered, conformance impact
4. **Comment period** — minimum 14 days
5. **Decision** — the editor accepts or rejects; either way, a decision
   entry lands in `decisions/` with the rationale reference

Before 1.0.0, anything may change via RFC. After 1.0.0, §3–§6 of the spec
are frozen; RFCs may only add optional capabilities.

## Disputes

An entry in this project's own bundle can be marked `status: contested`
like any other. While contested, tooling treats it conservatively and the
entry's owner must resolve or route it. Meaning disagreements here get the
same treatment we prescribe for everyone else.

## Path to neutral governance

The stated destination is contribution to the **Agentic AI Foundation**
(Linux Foundation), where AGENTS.md and MCP already live. The trigger is
adoption evidence, not a date: when v1.0's criteria are met (see
ROADMAP.md), the editor will open the donation RFC. Until then, BDFL
governance is the honest description, and this document says so rather
than pretending otherwise.

---

## The constitution

Twelve principles that outrank any feature request. RFCs that conflict
with these need to amend the constitution first, explicitly.

1. Humans and machines are first-class consumers of meaning.
2. Meaning is canonical only by explicit designation; generated
   projections are never canonical.
3. Organisational disagreement must be representable (`contested` is a
   real state).
4. Meaning carries accountability: every entry has exactly one owner.
5. Closer scopes may narrow meaning or authority; they may never
   silently widen it.
6. Security primitives are borrowed, never rebuilt.
7. ORG.md describes meaning; other systems execute work. Skills define
   how; ORG.md defines what is true and what constrains.
8. Unknown authority escalates; it never assumes.
9. Agents may propose meaning; accountable humans ratify it.
10. Conformance is behavioural, not syntactic. For resolvers, compilers
    and gates it is a pass/fail claim against the published conformance
    suite. Consumer behaviour under resolved context is measured and
    reported as a benchmark score, never claimed as conformance.
    <!-- amended per RFC 0015 (draft) -->
11. The standard stays vendor-neutral: nothing in the canonical layer is
    specific to any model provider or platform.
12. Anything that does not require shared organisational meaning stays
    outside the standard.

---

## Seed decisions

```markdown
---
id: dec.0001
owner: role.editor
scope: public
status: approved
source: native
decided: 2026-08-15
---
**DEC-0001 — Open source, split licence.** Specification text CC BY 4.0;
reference implementations Apache-2.0 (patent grant matters to enterprise
adopters); contributions via DCO, not CLA (labs' engineers can contribute
without legal review).
```

```markdown
---
id: dec.0002
owner: role.editor
scope: public
status: approved
source: native
decided: 2026-08-15
revisit: 2027-03-01
---
**DEC-0002 — BDFL until v1.0.** One editor decides spec RFCs until the
v1.0 criteria are met, then the donation RFC opens. Revisit at v1.0 or
the revisit date, whichever comes first.
```

```markdown
---
id: dec.0003
owner: role.editor
scope: public
status: superseded
source: native
decided: 2026-08-15
---
**DEC-0003 — The suite is the spec.** Conformance is defined by passing
the published bench suite for the claimed level. Where prose and suite
conflict, file an issue; an RFC resolves it. Superseded by DEC-0022
(conformance attaches to deterministic implementations; agent behaviour
is a benchmark score; where the suite is silent the prose governs).
```

```markdown
---
id: dec.0004
owner: role.editor
scope: public
status: approved
source: native
decided: 2026-08-15
---
**DEC-0004 — Resolution, not inheritance.** Consumers receive resolved
effective context from a resolver; they never traverse the tree.
Definitions sharing an id resolve closest-wins; constraints stack
conjunctively and may only narrow. The resolver is part of the trusted
base and is itself a subject of conformance.
```

```markdown
---
id: dec.0005
owner: role.editor
scope: public
status: approved
source: native
decided: 2026-08-15
---
**DEC-0005 — No confidence field; staleness is computed.** Uncertainty is
expressed through `draft` and `contested`, never a stored confidence
number (consumers would threshold on it; unenforceable, unauditable).
Staleness is derived by tooling from revisit dates, owner changes, and
source drift — there is no authored `stale` status, because it would
itself go stale.
```

```markdown
---
id: dec.0006
owner: role.editor
scope: public
status: approved
source: native
decided: 2026-08-15
---
**DEC-0006 — Profile, don't invent.** Where a mature standard solves a
component, ORG.md profiles it: TUF/Sigstore for org.lock, JSON Schema for
entry validation, MADR for decision records, OPA/Cedar as gate compile
targets, OpenTelemetry (org.context.* namespace) for audit events.
Bespoke mechanisms need an RFC explaining why the mature option fails.
```

```markdown
---
id: dec.0007
owner: role.editor
scope: public
status: approved
source: native
decided: 2026-08-15
---
**DEC-0007 — No typed relationships.** Entries relate only by `ref:` and
supersession. Typed relations between entries are the ontology slide that
killed RDF/OWL adoption in organisations; adding them requires amending
the constitution, not just passing an RFC. Recorded alongside NON-GOALS
item 9.
```
