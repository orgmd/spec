---
id: term.bundle
owner: role.editor
scope: public
status: approved
source: native
---
**bundle** — a directory tree conforming to SPEC §3, attached to one node in
an organisational hierarchy.

---
id: term.entry
owner: role.editor
scope: public
status: approved
source: native
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
---
**resolver** — computes effective context for a consumer: definitions
resolve closest-wins; constraints stack and may only narrow. Part of the
trusted base; a subject of conformance.

---
id: term.projection
owner: role.editor
scope: public
status: approved
source: native
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
---
**gate** — the enforcing projection: `org.policy(action) → allow | escalate |
deny`; unknown → escalate.
