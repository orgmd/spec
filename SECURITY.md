# Security

## Reporting

Report vulnerabilities privately to **security@orgmd.dev** (placeholder —
set before launch). Please do not open public issues for security reports.
Acknowledgement within 72 hours; coordinated disclosure preferred; credit
given unless you'd rather not.

In scope: the spec's security semantics (§4.2, §5–§8), the reference
compiler, the gate, the bench harness. Especially valuable: scope-widening
via inheritance tricks, projection leakage, gate non-determinism, and
`org.lock` verification bypasses.

## Threat model (summary)

ORG.md concentrates meaning, so the design assumes the bundle is a target:

1. **The bundle is an attack surface.** Injected context steers every
   downstream agent. Mitigations: reviewed writes only, signed manifests
   (`org.lock`), verification before load, revocation with TTL'd trust and
   fall-back to last known-good.
2. **Context obeys least privilege.** Every entry is scoped; every consumer
   receives a projection, never the bundle; scopes may narrow down the
   inheritance tree and never widen. At Extended conformance, scopes
   resolve to the organisation's own identity system.
3. **Prompts advise; the gate enforces.** Advisory projections are labelled
   as such. Deterministic policy answers exist only at the gate, and an
   unknown action returns `escalate`, never `allow`.
4. **Borrow, never build.** No key infrastructure, identity store, or log
   store of our own — keys in the org's KMS, identity in the org's IdP,
   audit to the org's SIEM. Every security primitive this project invented
   would be one you'd have to trust; so it invents none.

## Known limitations (honest list)

- Advisory projections cannot bind a model. If your deployment has no
  gate, you have documentation, not enforcement — the spec requires
  saying so.
- Scope labels protect against over-sharing by construction, not against a
  compromised consumer with legitimate clearance.
- The leakage properties of scoped prompts under adversarial pressure are
  an open research question; leakage checks are on the bench roadmap
  (v0.7–0.9) precisely because we don't yet claim them.
