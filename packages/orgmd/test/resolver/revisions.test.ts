import { describe, expect, it } from "vitest";
import type {
  BundleMetadata,
  Domain,
  EntryRevision,
  ValidatedBundle,
} from "../../src/model/types.js";
import { selectEffectiveRevisions } from "../../src/resolver/revisions.js";
import { resolveContext } from "../../src/resolver/resolve.js";

function revision(
  id: string,
  rev: number,
  status: EntryRevision["status"],
  overrides: Partial<EntryRevision> = {},
): EntryRevision {
  return Object.freeze({
    id,
    owner: "role.editor",
    scope: "public",
    status,
    source: "native",
    rev,
    domain: "glossary" as Domain,
    body: `${id} revision ${String(rev)}`,
    sourcePath: "glossary.md",
    line: rev,
    extra: Object.freeze({}),
    ...overrides,
  });
}

function bundle(
  entries: readonly EntryRevision[],
  lifecycle: BundleMetadata["lifecycle"] = {},
): ValidatedBundle {
  return {
    reference: "root-reference",
    path: "org",
    isRoot: true,
    metadata: { bundle: "org.root", lifecycle },
    entries,
  } as unknown as ValidatedBundle;
}

describe("effective revision selection", () => {
  it("computes ratification and lifecycle states without mutating revisions", () => {
    const entries = Object.freeze([
      revision("term.current", 1, "approved"),
      revision("term.pending", 1, "approved"),
      revision("term.pending", 3, "draft"),
      revision("term.proposed", 2, "draft"),
      revision("term.contested", 1, "approved"),
      revision("term.retired", 1, "approved"),
    ]);
    const before = structuredClone(entries);

    const selected = selectEffectiveRevisions(
      bundle(entries, {
        "term.contested": {
          state: "contested",
          by: "role.editor",
          date: "2026-08-20",
          ref: "https://example.test/dispute/1",
        },
        "term.retired": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-20",
        },
      }),
      0,
    );

    expect(
      selected.map(({ id, state, revision: effective }) => ({
        id,
        state,
        rev: effective?.rev,
      })),
    ).toEqual([
      { id: "term.contested", state: "contested", rev: 1 },
      { id: "term.current", state: "current", rev: 1 },
      { id: "term.pending", state: "pending", rev: 1 },
      { id: "term.proposed", state: "proposed", rev: undefined },
      { id: "term.retired", state: "retired", rev: undefined },
    ]);
    expect(entries).toEqual(before);
  });

  it("uses the highest approved revision and ignores higher drafts and rejections", () => {
    const result = resolveContext({
      path: [
        bundle([
          revision("term.freight", 1, "approved"),
          revision("term.freight", 2, "approved"),
          revision("term.freight", 3, "draft"),
          revision("term.freight", 4, "rejected"),
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.entries).toHaveLength(1);
    expect(result.value?.entries[0]).toMatchObject({
      revision: { id: "term.freight", rev: 2 },
      bundleIndex: 0,
      contested: false,
    });
  });

  it("omits retired and proposed entries while retaining contested entries", () => {
    const result = resolveContext({
      path: [
        bundle(
          [
            revision("term.contested", 1, "approved"),
            revision("term.retired", 1, "approved"),
            revision("term.proposed", 1, "draft"),
          ],
          {
            "term.contested": {
              state: "contested",
              by: "role.editor",
              date: "2026-08-20",
              ref: "https://example.test/dispute/1",
            },
            "term.retired": {
              state: "retired",
              by: "role.editor",
              date: "2026-08-20",
            },
          },
        ),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value?.entries).toEqual([
      expect.objectContaining({
        revision: expect.objectContaining({ id: "term.contested" }),
        contested: true,
      }),
    ]);
  });
});
