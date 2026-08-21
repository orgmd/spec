# Task 11 report — explicit Markdown adoption import

## RED

Created the importer extraction and adoption tests before the importer modules
existed, then ran:

```text
npm test -- packages/orgmd/test/importer
```

The run failed as expected because `src/importer/markdown.js` and
`src/importer/adopt.js` could not be resolved.

## GREEN

- Markdown extraction preserves candidate order and source body text, handles
  ATX/setext headings, lists, paragraphs, fenced code, empty sections, and
  deterministic repeated-heading ID suffixes.
- Heading names provide only the documented domain suggestion. Every result is
  a `draft`; the importer never infers owners, scopes, revisit dates, actions,
  effects, routes, approvals, or semantic authority.
- Preview is a pure in-memory operation. Policy candidates remain preview-only
  until every required confirmation is supplied.
- Confirmed candidate revisions retain the source path through `ref`, are
  rendered only as `status: draft`, and are validated together with the
  existing target bundle in an isolated sibling directory before writes begin.
- Final per-domain replacements reuse `atomicWriteFile`; explicit target path
  safety and source/output collision checks preserve Task 10 traversal,
  symlink, overwrite, and source-preservation boundaries.

## Files

- `packages/orgmd/src/importer/types.ts`
- `packages/orgmd/src/importer/markdown.ts`
- `packages/orgmd/src/importer/render.ts`
- `packages/orgmd/src/importer/adopt.ts`
- `packages/orgmd/test/importer/markdown.test.ts`
- `packages/orgmd/test/importer/adopt.test.ts`
- `packages/orgmd/test/fixtures/importer/AGENTS.md`
- `packages/orgmd/test/fixtures/importer/CLAUDE.md`

## Preview and confirmation cases

- `AGENTS.md` terms preview is side-effect free and retains the source text.
- `CLAUDE.md` terms confirmation creates a validated `glossary.md` draft with
  `ref: "CLAUDE.md"`.
- Incomplete policy confirmations return `adopt.missing-confirmation` and
  leave the target untouched.
- A would-be write to the source file returns `adopt.source-output-conflict`.

## Verification

```text
npm test -- packages/orgmd/test/importer
# 2 files passed, 8 tests passed

npm test -- packages/orgmd/test/importer packages/orgmd/test/validation packages/orgmd/test/io
# 6 files passed, 87 tests passed

npm run typecheck
# passed
```

## Fix Round 1

### RED

Expanded the importer suites before changing production code and ran:

```text
npm test -- packages/orgmd/test/importer
```

The new cases failed against the initial implementation: source slices had
their list markers and CRLF bytes normalized away; suggested domains selected
output files without an explicit confirmation; stale and deserialized previews
were accepted; package-root exports were missing; and injected staged-swap,
rollback, durability, and physical source-identity seams were absent.

### GREEN

- A preview now has a deterministic SHA-256 `previewId` over every
  resolution/write-affecting public field, is recursively frozen, and is
  privately registered in-process. `writeAdoption()` rejects untrusted,
  tampered, and stale confirmations before filesystem mutation.
- Source bodies are exact byte slices: list markers, indentation, fenced code,
  paragraph line endings, and CRLF remain unchanged in candidates and rendered
  draft bodies.
- Every candidate requires a confirmed `domain`; suggestions remain display
  labels only. Policy-only confirmation fields are determined from that
  confirmed domain, including `route` for an escalation.
- Imports now clone the validated target into a sibling stage, write every
  output there atomically, validate the full stage, then make one durable
  target-to-backup/stage-to-target swap. Ordinary swap failures restore the
  original; rollback failure retains a recoverable backup and reports
  `adopt.rollback-failed`.
- Target and source identities are resolved physically. A source at or below
  the target, including a symlink alias, is rejected before the directory swap.
- The package root exports adoption functions and all adoption public types.

### Verification

```text
npm test -- packages/orgmd/test/importer
# 2 files passed, 17 tests passed

npm test -- packages/orgmd/test/importer packages/orgmd/test/init packages/orgmd/test/io packages/orgmd/test/validation
# 7 files passed, 111 tests passed

npm run typecheck
# passed
```
