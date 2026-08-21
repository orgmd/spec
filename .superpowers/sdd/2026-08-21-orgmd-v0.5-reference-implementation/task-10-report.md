# Task 10 report — safe validated initializer

## RED

Created the initializer and atomic-I/O suites before their modules existed and
ran:

```text
npm test -- packages/orgmd/test/init packages/orgmd/test/io
```

It failed as expected because `../../src/init/init.js` and
`../../src/io/atomic.js` could not be resolved. The later storage-failure test
was also run red with the injection removed: its simulated second write was
ignored, the plan succeeded, and the assertion correctly observed an unwanted
successful replacement. The raw traversal test first failed because the
initializer normalized the untrusted input before inspecting it.

## GREEN

- `planInit()` renders exactly `org.md`, `ownership.md`, and `policies.md` in
  memory; deterministic IDs are derived from the organization name and policy
  action.
- The rendered bundle is written only to an isolated temporary validation
  directory, loaded, validated as root, and checked by doctor with caller's
  injected `today`. Any parser, validation, or blocking doctor finding returns
  no plan.
- `writeInitPlan()` repeats validation before target mutation, stages all
  private-mode files in a same-parent directory, fsyncs that directory, then
  atomically renames it. Existing targets are moved to a sibling backup only
  after every staged file succeeds; replacement failures attempt rollback.
- `atomicWriteFile()` uses a same-directory private temporary file, fsync, and
  rename, with explicit overwrite checks and symlink/traversal rejection.

## Files

- `packages/orgmd/src/init/types.ts`
- `packages/orgmd/src/init/render.ts`
- `packages/orgmd/src/init/init.ts`
- `packages/orgmd/src/io/atomic.ts`
- `packages/orgmd/src/index.ts`
- `packages/orgmd/test/init/init.test.ts`
- `packages/orgmd/test/io/atomic.test.ts`

## Decisions and safety evidence

- `InitPlan` retains the injected `today` and explicit overwrite consent so
  revalidation is deterministic and cannot silently use the wall clock.
- Contested terms appear in the identity body as visibly `unratified`; the
  initial ownership records resolve both the editor and supplied policy owner,
  leaving doctor with no blocking orphan finding.
- Targets are explicit normalized paths only after their original input passes
  traversal checks. Symlink paths, non-directory targets, non-empty targets,
  and overwrite targets containing anything beyond the three regular generated
  files are rejected before writing.
- A real second-file failure simulation keeps all three previous target bytes
  unchanged and observes no `.orgmd-init-*` staging sibling after cleanup.

## Verification

```text
npm test -- packages/orgmd/test/init packages/orgmd/test/io packages/orgmd/test/validation packages/orgmd/test/doctor
# 7 files passed, 101 tests passed

npm run check
# format, typecheck, full test suite (24 files / 254 tests), and build passed
```

## Fix Round 1

### RED

Added durability-ordering and overwrite-swap tests, then ran:

```text
npm test -- packages/orgmd/test/init packages/orgmd/test/io
```

The new tests failed as intended: the atomic writer's injected rename/sync
events were empty, successful overwrite replacement emitted no parent-sync
events, and injected second/third rename failures were ignored because no
rename seam existed. Those failures demonstrated that a successful return did
not establish parent-directory durability and that swap/rollback behavior was
not directly testable.

### GREEN

- `atomicWriteFile()` now performs a directory fsync after its committed
  temporary-file-to-target rename. Its narrow `AtomicIo` seam verifies the
  actual renamed bytes are already visible when the parent-sync operation runs.
- `writeInitPlan()` now fsyncs the target parent after old-target-to-backup,
  staged-directory-to-target, backup removal, and rollback rename operations.
  A successful result therefore follows each required directory durability
  barrier.
- The overwrite transaction tracks whether the old target moved and whether a
  staged target installed. A failed swap restores and syncs the old directory;
  a failed rollback returns stable `init.rollback-failed`, retains the backup,
  and never reports partial success.
- The tested safety boundary now includes ancestor and target-directory
  symlinks, unexpected overwrite contents, explicit date gating, exact
  byte-stable scaffold/preview literals, and escalation route rendering.

### Verification

```text
npm test -- packages/orgmd/test/init packages/orgmd/test/io
# 2 files passed, 18 tests passed

npm run check
# format, typecheck, full test suite (24 files / 263 tests), and build passed
```
