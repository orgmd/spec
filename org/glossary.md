---
id: term.bundle
owner: role.editor
scope: public
status: approved
source: native
rev: 1
---
**bundle** — a directory tree conforming to SPEC §3, attached to one node in
an organisational hierarchy.

---
id: term.entry
owner: role.editor
scope: public
status: approved
source: native
rev: 1
---
**entry** — one unit of meaning with the SPEC §4 fields. A *definition*
(term, identity, ownership, decision, definition of done) or a *constraint*
(policy).

---
id: term.resolver
owner: role.editor
scope: public
status: approved
source: native
rev: 2
---
**resolver** — computes effective context for a consumer over its
designated resolution path: ordinary definitions resolve closest-wins,
authority definitions anchor rootward, constraints stack and may only
narrow structurally (SPEC §5). Part of the trusted base; a subject of
conformance.

---
id: term.projection
owner: role.editor
scope: public
status: approved
source: native
rev: 1
not: ["the source", "canonical"]
---
**projection** — a generated rendering of effective context for a target.
Never canonical.

---
id: term.gate
owner: role.editor
scope: public
status: approved
source: native
rev: 1
---
**gate** — the enforcing projection: `org.policy(action) → allow | escalate |
deny`; unknown → escalate.
