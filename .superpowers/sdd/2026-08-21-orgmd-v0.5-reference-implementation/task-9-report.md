# Task 9 report — deterministic bundle doctor

## RED

Created the doctor test suite before implementation and ran:

```text
npm test -- packages/orgmd/test/doctor
```

It failed as expected because `../../src/doctor/doctor.js` did not exist.
The package-entrypoint export test was also run red before adding the public
exports; it observed `publicApi.doctorBundle` as `undefined`.

## GREEN

Implemented deterministic, read-only doctor reporting over a validated bundle
with optional resolved context and an injected ISO calendar date. Findings use
the project diagnostic ordering, blocking findings map to exit code `1`, and
all other reports map to `0`.

## Files

- `packages/orgmd/src/doctor/types.ts`
- `packages/orgmd/src/doctor/doctor.ts`
- `packages/orgmd/src/index.ts`
- `packages/orgmd/test/doctor/doctor.test.ts`
- `packages/orgmd/test/doctor/ratios.test.ts`

## Decisions

- Core role resolution is organisational only: a role is present when its
  exact ID owns an effective ownership-domain entry. Orphan findings name the
  `own.last-resort` fallback where available and make no identity or human
  membership claim.
- Pending count is the number of unratified drafts above an effective approved
  revision. Divergence is detected from multiple pending drafts with distinct
  upstream digests or mixed native/synced origin, without external access.
- Context resolution errors become blocking findings. Withheld resolution IDs
  remain withheld in both message and `entryId`, preserving Core Mode A
  non-leakage.
- Ratios use effective entries, integer counts, UTF-8 domain ordering, and a
  two-decimal numeric percentage; a zero denominator returns `0`.

## Verification

```text
npm test -- packages/orgmd/test/doctor packages/orgmd/test/validation/dogfood.test.ts
# 3 files passed, 11 tests passed

npm run check
# format, typecheck, full test suite (22 files / 239 tests), and build passed
```

Dogfood validation followed by `doctorBundle({ today: "2026-08-21" })`
returned blocking exit code `0`.
