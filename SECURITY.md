# Security

## Reporting

Report vulnerabilities privately via [GitHub private vulnerability
reporting](https://github.com/orgmd/spec/security/advisories/new) on this
repository, or by email to **matt@boundfor.co.nz**. Please do not open
public issues for security reports.
Acknowledgement within 72 hours; coordinated disclosure preferred; credit
given unless you'd rather not.

In scope: the spec's security semantics (§4.2, §5–§8), the reference
compiler, the gate, the bench harness. Especially valuable: scope-widening
via resolution tricks, narrowing bypass, hidden-deny via clearance
filtering, resolution-failure handling, enforcement mislabelling,
projection leakage, gate non-determinism, and `org.lock` verification
bypasses.

## Threat model (summary)

ORG.md concentrates meaning, so the design assumes the bundle is a target:

1. **The bundle is an attack surface.** Injected context steers every
   downstream agent. Mitigations: reviewed writes only — including adapter
   writes, which land as unratified draft revisions and never resolve or
   get signed until a human owner ratifies them (SPEC §4.7) — signed
   manifests over approved revisions only, verification before load,
   revocation with TTL'd trust, forward-only recovery, and degradation to
   escalate-everything past a bounded freeze horizon (SPEC §7.5).
2. **Context obeys least privilege.** Every entry is scoped; every consumer
   receives a projection, never the bundle; scopes may narrow down the
   resolution path and never widen. Scope governs **disclosure, not
   applicability**: clearance redacts what a consumer is shown and never
   removes an entry from the decision set, so a rule cannot be evaded by
   asking with a lower clearance (SPEC §5.4). Every bundle on a resolution
   path must be delegated by its parent (SPEC §7.3); an undelegated bundle
   contributes nothing. At Extended conformance, scopes resolve to the
   organisation's own identity system. Scope filtering is a property of
   resolution and projection, not of storage: anyone with raw read access
   to a bundle reads every entry in it. Raw bundle access must therefore be
   at least as restrictive as the most restricted entry stored in it, and
   organisations wanting finer separation split entries into separately
   stored per-compartment bundles (SPEC §4.2).
3. **Prompts advise; interposed verdicts enforce.** Advisory projections
   are labelled as such. A target may be labelled `enforced` only where
   the verdict is applied by a component the agent cannot bypass (SPEC
   §6.4); a deployed but uninvoked gate is advisory. Deterministic policy
   answers exist only at the gate: an unknown action returns `escalate`,
   never `allow`, and an entry in resolution error denies.
4. **Borrow, never build.** No key infrastructure, identity store, or log
   store of our own — keys in the org's KMS, identity in the org's IdP,
   audit to the org's SIEM. Every security primitive this project invented
   would be one you'd have to trust; so it invents none.
5. **Authority cannot be captured from below.** Ownership and decision
   entries resolve from the bundle that anchors them, not from the bundle
   closest to the consumer, so merge rights on a leaf repository do not
   confer the ability to redirect escalations or restate a board decision
   (SPEC §5.2). Shadowing attempts are discarded and reported, never
   silently honoured.

## Known limitations (honest list)

- Advisory projections cannot bind a model. A gate that the agent is
  merely asked to call is advisory too: without an enforcement point in
  the execution path that the agent cannot bypass, you have documentation,
  not enforcement — and the spec requires saying so (SPEC §6.4).
- Withheld markers and their counts are a low-bandwidth side channel: a
  consumer can learn that sensitive meaning bears on its action, and
  roughly how much. This is a deliberate trade — hiding the marker
  reintroduces hidden deny.
- Upstream systems of record are trusted only as far as their reviewers.
  An adapter proposes text from a wiki anyone may edit; the ratifying
  human is the control, and a rubber-stamped ratification signs whatever
  was injected.
- The freeze horizon trades availability for safety: a consumer that
  cannot verify fresh metadata degrades to escalate-everything rather than
  serving stale answers, so an attacker who can block metadata delivery
  can force escalation load rather than a silent rollback.
- Scope labels protect against over-sharing by construction, not against a
  compromised consumer with legitimate clearance.
- The leakage properties of scoped prompts under adversarial pressure are
  an open research question; leakage checks are on the bench roadmap
  (v0.7–0.9) precisely because we don't yet claim them.

## v0.5 CLI boundaries

The reference CLI validates and compiles local bundle content; it is not a
sandbox, policy enforcement point, identity system, or safe executor for
untrusted repositories. Its `agents-md` and `prompt` projections are advisory
text. Their scope filtering reduces what is emitted, but it cannot stop a
recipient with legitimate clearance from copying, disclosing, or ignoring the
text. Withheld markers can also reveal that restricted material affects an
action.

For loading, bundle paths are canonicalized and a discovered child that
resolves outside the bundle root is rejected. For `compile --output` and
`init` writes, traversal segments and symbolic links in target paths are
rejected; writes use same-directory temporary files and atomic rename. `adopt
--write` only accepts an existing non-symlink target bundle. These controls
reduce common path-redirection mistakes, but callers should still run with the
least filesystem privilege and inspect previews before writing.

Parser limits are 16 MiB per content file, 10,000 entries per file, and 100
YAML aliases. v0.5 has no aggregate bundle-size, traversal-depth, or CPU time
limit. Use an operating-system or container resource limit before processing
an untrusted tree, and treat importer source text as untrusted until an owner
reviews the resulting draft.
