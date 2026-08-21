# RFC 0014 — Bundle integrity: TUF profile, path delegation, and a Core content identifier

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#10

## Motivation

§7 states the intent of bundle integrity but not enough of the mechanism
to be implementable or attackable-in-review. Four gaps were raised in
adversarial review. Each is exploitable with ordinary access, not
nation-state capability.

**1. Rollback by induced failure.** §7 says trust carries a TTL "with
fall-back to the last known-good version at next TTL expiry". An attacker
who can make verification *fail* — take the transparency log offline,
trigger a revocation, drop metadata at the CDN — does not need to forge
anything. They wait. At the next TTL expiry every consumer degrades to an
older bundle whose signatures are perfectly valid. A policy tightened
last week ("claims agents may not call the payments tool") reverts to the
version before it, and the reversion is indistinguishable from correct
operation. Worked example: an org narrows `policy.P-03` from `escalate`
to `deny` on Monday; the attacker DoSes the log on Tuesday; on Wednesday
the fleet is back on Sunday's bundle and the gate answers `allow`.

**2. No path attestation.** `org.lock` is per-bundle. §5 resolves
definitions closest-wins, so the bundle nearest the consumer — in
practice a *repository*, the most writable artefact in the organisation —
wins every definition it names. Its signature proves only that it signed
itself. Anyone with commit rights on one repo can redefine
`term.consignment` for that repo's agents, and every signature in the
chain verifies. There is no statement anywhere that the org *authorised*
that repo to speak.

**3. Unsigned content inside a signed bundle.** `org.lock` hashes
*entries*. §3 requires implementations to ignore unknown files. Together
these mean a file can be added to a verified bundle, be covered by no
hash, and be ignored by the parser today — but be picked up by the next
tool version, a different implementation, or a projection step that
globs. Signed-bundle integrity must be a statement about the whole
directory, not about the subset one parser happened to read.

**4. No Core version identifier.** §5.6 and §6.1 require every resolution
and every projection to be marked with "the bundle versions it was
resolved from". §12 defines bundle versioning only through `org.lock`,
which is Extended. A Core implementation is therefore required to emit a
value the specification never defines. §11's promise that two conforming
resolvers produce the same effective context is untestable without a
canonical form to compare, and the reference to byte-identical output has
nothing to bite on. Separately, §7 says consumers "SHOULD verify before
loading" and in the next clause "MUST NOT load a bundle that fails
verification" — a bundle never verified has not failed verification, so
the two sentences permit opposite behaviour.

Per DEC-0006 this RFC profiles TUF and adds no new cryptography. Per the
Core promise in §11, the Core half needs no keys, no signing service and
no network: it is a hash function and a canonicalisation rule.

## Design

§7 is replaced by the following. §7.1 is normative at **Core**; §7.2–§7.6
are normative at **Extended**.

### §7.1 Bundle content identifier (Core)

Every bundle MUST have a **content identifier**: a hash over its entries
computed identically by every implementation, with no signing
infrastructure.

Implementations MUST compute it as follows.

**Entry canonical form.** For each entry in the bundle, construct a JSON
object with exactly these members, and no others:

- `id`, `owner`, `scope`, `status`, `source` — the §4 required fields, as
  strings.
- `domain` — the semantic domain the entry was mapped to (§3), as a
  string: one of `identity`, `glossary`, `decision`, `policy`,
  `ownership`, `done`, or an implementation-mapped domain name.
- `revisit`, `ref` — included only if present, as strings.
- `body` — the entry's Markdown body, normalised as below.

Body normalisation, applied in order: decode as UTF-8; normalise to
Unicode NFC; replace CRLF and CR with LF; strip trailing spaces and tabs
from every line; remove leading and trailing blank lines. No other
transformation is applied; the body is otherwise opaque bytes.

Unknown front-matter keys MUST NOT be included in the canonical form.
§3's ignore-unknown rule governs parsing, and the Core identifier
identifies parsed meaning, not file bytes. §7.4 governs unknown *files*
in a signed bundle and reaches the opposite conclusion for that case,
deliberately.

**Serialisation.** The object MUST be serialised with the JSON
Canonicalisation Scheme (RFC 8785). Implementations MUST NOT define a
local canonicalisation.

**Entry digest.** `entry_digest = SHA-256(JCS bytes)`, rendered as
lowercase hexadecimal.

**Bundle content identifier.** Sort all entries by `id`, ascending, by
byte order of the UTF-8 encoding of the id. Duplicate `id` values within
a single bundle MUST be a load failure, not a hash input. Build the
digest input by concatenating, for each entry in that order, the UTF-8
bytes of `id`, then `0x0A`, then the lowercase hex `entry_digest`, then
`0x0A`. The content identifier is `sha256:` followed by the lowercase hex
SHA-256 of that input.

Implementations MUST emit the content identifier wherever §5.6 and §6.1
require a bundle version, and MUST render it in full, not abbreviated.
Where §5, §6 and §12 say "bundle version", the normative value is the
content identifier at Core, and the `org.lock` version number *together
with* the content identifier at Extended.

**Effective-context canonical form.** Two conforming resolvers given the
same tree, identity and clearance MUST produce byte-identical serialised
effective context. The serialisation is a JCS-serialised JSON object with
members `entries` (the array of entry canonical forms, in the same sort
order as above, after resolution), and `bundles` (an array of objects
with `path` and `content_id`, ordered root to node). This form is the
comparison target for resolver conformance under §11.

The content identifier is an integrity and identity value only. It is not
evidence of authorship and MUST NOT be presented as such.

### §7.2 TUF profile (Extended)

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
  version. Timestamp expiry SHOULD be one day or less. It is the freshness
  signal on which §7.5 depends.

Implementations MAY use Sigstore for keyless signing of targets,
snapshot and timestamp, binding signatures to OIDC identity. Keys MUST be
held in the organisation's existing key management; this specification
defines no key infrastructure of its own.

**Rollback protection.** A consumer MUST persist, per role and per
bundle, the highest metadata version number it has successfully verified.
It MUST reject any metadata whose version number is lower than the
persisted value, and MUST reject expired metadata. Metadata that fails
either check MUST be treated as a verification failure under §7.5, never
as an absent bundle.

**Verification is mandatory, not advised.** A consumer at Extended
conformance MUST verify a bundle before loading it. A bundle that fails
verification MUST NOT be loaded. A bundle that has not been verified MUST
NOT be loaded. The former "SHOULD verify" is withdrawn.

Bundles MUST change only through reviewed writes; direct writes to a
served bundle are a conformance failure at Extended level.

### §7.3 Path delegation (Extended)

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
- Ignoring MUST NOT be silent. The resolver MUST emit a diagnostic
  naming the undelegated bundle and MUST emit an audit event (§8) where
  audit is implemented. Silent omission is indistinguishable from a
  bundle that does not exist, and would let an attacker suppress a
  constraint by breaking its delegation.
- Delegation MUST NOT widen. A delegation grants a child the ability to
  define ids within a namespace and to *narrow* constraints per §5.4; it
  can never grant the ability to widen a constraint or a scope.
- Delegation is transitive only one step at a time: a grandchild is
  reachable only if each link on the path is delegated. A parent MAY
  restrict a delegation to non-transitive (TUF "terminating" analogue),
  in which case the child MUST NOT delegate further.

### §7.4 Whole-directory integrity (Extended)

`org.lock` MUST list, in addition to entry digests, a `files` map from
every path in the bundle directory to its SHA-256 digest. The map MUST
cover every regular file in the directory tree except `org.lock` itself
and the detached signature files the profile defines.

At load, an implementation MUST enumerate the bundle directory. If any
file is present that the `files` map does not cover, or any digest does
not match, or any covered file is absent, verification MUST fail and the
bundle MUST NOT be loaded. Symbolic links and paths that escape the
bundle directory MUST cause verification to fail.

§3's requirement to ignore unknown files is a *parsing* rule and remains
in force at Core. At Extended it does not license loading a signed bundle
that contains content nobody signed.

### §7.5 Verification failure, revocation and the freeze horizon

The "fall-back to the last known-good version at next TTL expiry" rule is
withdrawn. It is replaced by the following.

- A consumer that cannot verify current metadata MUST NOT load the
  failing bundle, and MUST NOT reach for an older bundle version.
  Recovery is forward only.
- The consumer MAY continue serving the **held context**: the effective
  context it last resolved from successfully verified metadata. Held
  context MUST be at or above the highest metadata version the consumer
  has verified, and MUST NOT be a version listed as revoked.
- **Revoked versions are never fallback targets.** An implementation MUST
  maintain the revocation state carried in verified root and targets
  metadata. A held context whose bundle version becomes revoked MUST be
  evicted immediately on learning of the revocation, with no grace period
  and no TTL wait; the consumer enters degraded mode (below) at once.
- Every response served from held context MUST be marked as served from
  held context, with the age of the metadata it rests on. Gate responses
  MUST carry the marker alongside the bundle versions and `id`s required
  by §6.3.
- **Freeze horizon.** An implementation MUST define a freeze horizon,
  measured from the expiry time of the most recently verified timestamp
  metadata. The default SHOULD be 7 days and MUST NOT exceed 30 days.
  Reaching the horizon means an attacker has been able to freeze this
  consumer for that long, and continued service of stale meaning is no
  longer safe.
- **Degraded mode.** Past the freeze horizon, or on eviction of revoked
  held context, the implementation MUST enter degraded mode:
  `org.policy(action)` MUST return `escalate` for every action, including
  actions a held policy would have allowed; `org.define`,
  `org.decision` and `org.who_owns` MUST either return no result or
  return results explicitly marked unverified-and-expired; already-emitted
  advisory projections MUST be regenerated with a visible expiry notice or
  withdrawn. Degraded mode MUST be reported by drift tooling (§10) and
  emitted as an audit event (§8) where those levels are implemented.
- Degraded mode MUST NOT be exited except by successful verification of
  fresh metadata. There is no operator override at Extended conformance.

Escalate-everything is a loud, safe failure. Serving stale `allow`
answers indefinitely is a quiet, unsafe one, and it is the state the
withdrawn rule produced.

### §7.6 Interaction with §5

An undelegated or unverified bundle is not a lower-priority bundle: it is
absent from the resolution path for the purposes of §5.3 and §5.4, and
its absence is reported. A closer bundle can therefore never win a
definition or narrow a constraint by being writable alone; it must also
be delegated.

## Alternatives considered

**Do nothing.** The four gaps stay. Rollback-by-DoS is the serious one:
it needs no key compromise, and the current text specifies the attack as
the intended behaviour. Path attestation is the second: without it, a
central claim of the standard — that closer scopes narrow, never widen —
is enforced only by convention among people who can already commit to the
repo. Doing nothing also leaves Core implementations required to emit a
bundle version the spec does not define, and leaves §11 untestable.

**Sign the whole tree with one key.** Simple, and it solves path
attestation by fiat: only the org signs, so no repo can redefine
anything. Rejected because it removes the delegation the tree exists for.
Teams must be able to add team meaning without the org holding the pen on
every commit, or bundles will not be maintained at the edges. TUF
delegation exists precisely to give per-scope authority under a central
root.

**Certificate chains (X.509) instead of TUF delegations.** Mature and
widely deployed, and organisations already run PKI. Rejected because
X.509 alone gives no snapshot, no timestamp and no rollback protection;
those would have to be built on top, which is the invention DEC-0006
forbids. Sigstore is admitted where keyless signing is wanted, but as a
signing mechanism inside the TUF profile, not as a replacement for it.

**Sigstore transparency log as the sole freshness signal.** Attractive,
and it gives public auditability. Rejected as the sole mechanism because
log availability then becomes the availability of every consumer's
policy decisions — which is the DoS-to-rollback path this RFC closes.
The log is a good corroborator and a poor dependency.

**Git commit hashes as the Core version identifier.** Free, and every
bundle is in Git in practice. Rejected: it identifies a repository state,
not bundle content, so the same meaning gets different identifiers in a
fork, a subtree split, or a bundle served from an archive; and it makes
§11's byte-identical comparison depend on a VCS the spec must not
require.

**Hash the raw file bytes for the Core identifier.** Simpler to
implement. Rejected because trivial non-semantic edits — reordering
front-matter keys, changing line endings on a Windows checkout,
reflowing a paragraph — would change the identifier, so identifiers would
churn constantly and resolver comparison would fail for reasons nobody
cares about. Canonicalising parsed entries makes the identifier a
statement about meaning.

**Invent an ORG.md canonicalisation instead of profiling RFC 8785.**
Rejected under DEC-0006. JCS is specified, tested and has
implementations in every language a resolver is likely to be written in.

**Freeze horizon as an operator-configurable value with no ceiling.**
Rejected. An unbounded horizon is the withdrawn rule with extra steps: an
attacker who can freeze a consumer indefinitely gets indefinite stale
`allow` answers. A ceiling makes the worst case bounded and stated.

## Conformance impact

**Core** gains one requirement: compute and emit the §7.1 content
identifier. It needs a YAML parser, a JCS serialiser and SHA-256 — no
keys, no network, no signing service. The "afternoon" promise in §11
holds.

**Extended** gains the TUF role model, delegation, whole-directory
hashing, and the failure/freeze-horizon behaviour. Implementations that
today verify a single detached signature over an entry-hash manifest are
not Extended-conformant under this RFC and will need the snapshot and
timestamp roles.

**Full** is unchanged in substance; §7.5 adds two required audit events
(entry to degraded mode; ignoring an undelegated bundle).

New suite tests, at the levels shown:

- *Core:* content-identifier vectors — a fixture set of bundles with
  published expected identifiers, including cases that must **not**
  change the identifier (front-matter key reorder, CRLF, trailing
  whitespace, unknown key added) and cases that must (body edit, status
  change, entry added or removed).
- *Core:* effective-context canonical-form vectors for two-resolver
  comparison, replacing the untestable prose in §11.
- *Extended:* rollback — serve metadata at a lower version; verification
  must fail and held context must not regress.
- *Extended:* mix-and-match — current org bundle with stale team bundle;
  resolution must fail on the snapshot check.
- *Extended:* undelegated bundle — valid self-signature, no parent
  delegation; entries must not appear in effective context and a
  diagnostic must be emitted.
- *Extended:* out-of-namespace entry from a delegated bundle — must be
  ignored.
- *Extended:* unhashed file present — verification must fail.
- *Extended:* revoked held context — must be evicted without waiting for
  TTL; degraded mode entered.
- *Extended:* freeze horizon — advance the clock past the horizon; every
  `org.policy` answer must become `escalate`.

Migration: bundles produced before this RFC have no `files` map and no
delegations. Implementations SHOULD accept such `org.lock` files as Core
artefacts only, and MUST NOT report Extended conformance for a tree that
lacks snapshot and timestamp metadata.

## Constitution check

This RFC does not amend the constitution.

**Principle 6 — security primitives are borrowed, never rebuilt.**
Upheld and strengthened. Every mechanism here is a profile: TUF roles and
delegation, Sigstore for keyless signing, RFC 8785 for canonicalisation,
SHA-256 for digests. The one thing this RFC composes rather than borrows
is the freeze-horizon-to-escalate rule, which is a policy over TUF's
existing freshness signals, not new cryptography, and it is stated in
terms of TUF timestamp expiry rather than a mechanism of our own.

**Principle 5 — closer scopes may narrow, never silently widen.**
Upheld and made enforceable. §7.3 is what turns principle 5 from a
convention into a verifiable property; today a writable child bundle can
widen meaning simply by being closer.

**Principle 8 — unknown authority escalates; it never assumes.** Upheld.
Degraded mode is principle 8 applied to the case where authority has
become unknowable because its evidence expired.

**Principle 10 — conformance is behavioural.** Untouched by this RFC;
§7.1 supplies the canonical form that makes resolver behaviour
comparable, which the principle already assumes exists. RFC 0015 handles
the principle-10 question directly.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0021.md` (dec.0021). Normative text landed in SPEC.md
0.3-draft via PR #16.
