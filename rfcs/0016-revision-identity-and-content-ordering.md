# RFC 0016 — Revision identity and content ordering

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-09-01
- **Comment period ends:** waived by the editor's direct implementation direction
- **Refines:** RFC 0001, RFC 0007, RFC 0014

## Motivation

The specification defines an entry as a sequence of revisions sharing an
`id`, but three older clauses still treat `id` as unique within a bundle.
That makes ordinary revision history invalid under §4.5, gives it the
`duplicate_id` failure in §5.3, and leaves §7.1 unable to compute a content
identifier because its sort rejects the repeated `id` values that revisions
require.

The reference implementation and the Core conformance corpus already follow
the intended model: they group revision records by `id`, distinguish them by
`rev`, hash every revision, and select only the highest approved revision for
resolution. The normative record must say the same thing.

The existing `rev` field also admits integers outside the range that JSON
implementations can compare without loss. A content identifier ordered by
such values would not be portable across implementations.

## Design

### Logical entry and revision identity

- Within a bundle, `id` identifies one logical entry. A logical entry MAY
  contain any number of revision records sharing that `id`.
- The pair (`id`, `rev`) MUST be unique within a bundle. Two revision records
  with the same pair are a validation failure whether they occur in one file
  or different files.
- All revision records sharing an `id` in a bundle MUST map to the same
  semantic domain and kind. Existing `kind_mismatch` handling is unchanged.
- The pair (`bundle`, `id`) identifies the logical entry for tree and
  resolution purposes. The same `id` in different bundles continues to
  denote the entry being overridden or narrowed under §5.
- `rev` MUST be a positive integer in the inclusive range 1 through
  9007199254740991. This is the IEEE-754 safe-integer range used by I-JSON
  and makes numeric comparison exact in conforming implementations.

### Content identifier

The Core bundle content identifier MUST include every revision record,
including `draft`, `approved`, and `rejected` revisions. Revision records MUST
be sorted first by `id`, ascending by the byte order of its UTF-8 encoding,
and then by `rev`, ascending numerically. A duplicate (`id`, `rev`) pair MUST
fail validation or loading and MUST NOT be accepted as hash input.

The digest framing is unchanged. Each revision's `rev` remains inside its JCS
canonical form and therefore inside its entry digest; the digest-input line
continues to contain `id` and `entry_digest` only.

The historical `duplicate_id` resolution-error code from RFC 0007 retains its
name for compatibility, but its condition is corrected to a duplicate
(`id`, `rev`) revision record. Implementations MAY continue to report a more
specific stable validation-boundary diagnostic, such as
`validation.duplicate-rev`, before resolution begins.

### Earlier RFCs

This RFC refines and supersedes only the following clauses; the rest of each
RFC remains in force:

- RFC 0001's within-bundle `id` uniqueness rule, its closest-wins rationale,
  and its `id-dup-in-bundle` conformance case;
- RFC 0007's `duplicate_id` condition; and
- RFC 0014's content-identifier ordering and duplicate rejection rule as
  incorporated into SPEC §7.1.

Accepted RFCs remain historical records and are not rewritten.

## Alternatives considered

**Hash only the effective revision.** Rejected. The Core bundle identifier is
the authoring-state identifier and intentionally changes when a draft or
rejected revision changes. Publication identity is a separate protocol
contract.

**Sort equal ids by file order or entry digest.** Rejected. File enumeration
order is not portable, while digest order discards the authored revision
sequence and permits duplicate revision identities.

**Allow arbitrary-size revision integers.** Rejected for Core. JSON number
parsers do not preserve all arbitrary integers, so independent implementations
could disagree about both ordering and duplicate identity.

**Rename every existing duplicate diagnostic.** Rejected. Correcting the
condition does not require an avoidable public diagnostic-code break.

## Conformance impact

**Core.** The entry schema restricts `rev` to the positive IEEE-754
safe-integer range. The language-neutral suite adds vectors that:

1. accept two revision records with one `id` and distinct `rev` values;
2. reject a duplicate (`id`, `rev`) pair;
3. reject revision values outside the positive safe-integer range, including
   zero and a value above the maximum; and
4. distinguish numeric revision order from lexical order with revisions 1,
   2, and 10 while remaining invariant to input enumeration order.

Existing single-revision content identifiers are unchanged. The reference
implementation's multi-revision identifier algorithm is unchanged.

**Extended and Full.** No additional change. Their bundle integrity and audit
records consume the corrected Core content identifier.

## Constitution check

No constitutional amendment is required. This correction makes the existing
revision model and deterministic-conformance principle internally consistent.

## Decision

Accepted 2026-09-01 by the editor's direct implementation direction. Recorded
as `org/decisions/DEC-0023.md` (dec.0023).
