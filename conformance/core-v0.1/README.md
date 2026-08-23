# ORG.md Core conformance vectors v0.1

This directory is the language-neutral Core conformance corpus for ORG.md
specification 0.3.1. Every JSON case is either one vector or an array of
vectors with this shape:

```json
{
  "name": "stable case name",
  "operation": "parse | validate | content-id | context-id | resolve | compile-agents-md | compile-prompt",
  "input": {},
  "expected": {}
}
```

The values in `expected` are normative fixtures, not snapshots. Hashes and
canonical JSON strings are fixed literals derived independently of the
TypeScript implementation. A runner must never rewrite them from observed
implementation output.

## Operation inputs

- `parse` supplies UTF-8 text, a logical source path, and a domain. Results
  contain parsed records and diagnostics reduced to stable codes and source
  positions.
- `validate` supplies a parsed bundle. Results contain validity and stable
  diagnostic coordinates. Unknown front-matter extension keys remain in the
  input so identifier cases can prove that they do not affect Core hashes.
- `content-id` supplies a parsed bundle that must validate before hashing.
- `context-id` supplies ordered bundle versions, a clearance set, and the
  validated ISO calendar date `as_of` used for temporal resolution. Bundle
  versions use `bundle_id`, `content_id`, and logical `node_path`; physical
  filesystem paths are never identifier input. Optional `bundle_failures`
  records use `bundle_index`, `code`, and stable `detail`.
- `resolve` supplies normalized validated bundles on one designated path.
  Results keep canonical effective-context bytes, visible ids, fixed-shape
  withheld markers, resolution errors, and diagnostics as separate members.
  Its optional `bundle_failures` overlay has the same neutral snake-case shape
  and is normalized before calling the public resolver.
- `compile-agents-md` and `compile-prompt` supply the same normalized resolver
  request and compile only its successful effective context. Their expected
  profile content is fixed in the JSON vector and mirrored in the matching
  `.txt` file under `cases/compiler/`, which the runner compares as UTF-8
  bytes.

Resolution vectors use normalized entry records because the operation under
test begins at the resolver boundary. Their fields correspond directly to
the entry canonical form plus `source_path`, `line`, and `extra`. Bundle
`path` is a fixture-local physical location; `node_path` is the logical path
that affects delegation and context identity.

All arrays whose order is semantic are explicit. All diagnostic, error, and
entry output ordering is part of the expected result.

## Coverage and exclusions

This matrix is the explicit §11 coverage declaration for `core-v0.1`. “Not in
this corpus” is not a claim of conformance for that behavior.

| SPEC section                 | Tested Core behavior in `core-v0.1`                                                                                                                                                                                                                                                                                                         | Not in this corpus / ownership                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §3 Bundle layout and grammar | BOM and CRLF acceptance; fenced delimiter handling; blank-line record boundary; duplicate YAML key position; parsed domain and source coordinates                                                                                                                                                                                           | Whole-directory discovery permutations and safe filesystem loading are implementation tests, not neutral vectors; Extended `org.lock` coverage is §7 work  |
| §4 Entry model               | Ratification vocabulary; mandatory revisit; synced provenance; lifecycle references; retirement and contestation; custom-scope cycles; constraint fields, action grammar, effect, and routes; current, pending, and proposed election                                                                                                       | Identity-backed ratification, lifecycle write authority, adapters, and upstream synchronization transport are outside Core                                 |
| §5 Resolution                | Ordered path and closest definitions; custom-scope narrowing; authority anchoring, valid delegation, and unauthorised shadows; structural policy narrowing; kind mismatch; entry-, bundle-, and request-scoped blast radius; deterministic errors; Mode A withholding and clearance-safe error ids; logical `node_path` in context identity | Extended cryptographic path delegation and any deployment-specific identity-to-clearance mapping are outside Core                                          |
| §6 Projections               | Both v1 advisory projection profiles, successful resolved-context input, Mode A withheld counts, profile envelopes, and exact UTF-8 bytes                                                                                                                                                                                                     | The enforced gate is out of scope for this release                                                        |
| §7 Integrity                 | All-revision content hashing; metadata-only changes; unknown-key invariance; Unicode/body normalization; entry and clearance permutation invariance; path- and temporal-resolution-sensitive context IDs; bundle-failure state in context IDs; exact canonical effective-context bytes                                                        | TUF signing, `org.lock`, cryptographic delegation, whole-directory integrity, revocation, and freeze-horizon behavior are Extended and are not tested here |
| §8 Audit                     | No Core audit behavior is claimed                                                                                                                                                                                                                                                                                                           | Audit storage and Full-conformance audit events are out of scope                                                                                           |

The corpus also deliberately excludes MCP surfaces, signing and key
management, adapters, retrieval, workflow, and hosted enforcement. Those
exclusions must not be inferred as silently passing cases.
