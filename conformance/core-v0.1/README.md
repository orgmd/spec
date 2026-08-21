# ORG.md Core conformance vectors v0.1

This directory is the language-neutral Core conformance corpus for ORG.md
specification 0.3.1. Every JSON case is either one vector or an array of
vectors with this shape:

```json
{
  "name": "stable case name",
  "operation": "parse | validate | content-id | context-id | resolve",
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
- `context-id` supplies ordered bundle versions and a clearance set. Bundle
  versions use `bundle_id`, `content_id`, and logical `node_path`; physical
  filesystem paths are never identifier input.
- `resolve` supplies normalized validated bundles on one designated path.
  Results keep canonical effective-context bytes, visible ids, fixed-shape
  withheld markers, resolution errors, and diagnostics as separate members.

Resolution vectors use normalized entry records because the operation under
test begins at the resolver boundary. Their fields correspond directly to
the entry canonical form plus `source_path`, `line`, and `extra`. Bundle
`path` is a fixture-local physical location; `node_path` is the logical path
that affects delegation and context identity.

All arrays whose order is semantic are explicit. All diagnostic, error, and
entry output ordering is part of the expected result.
