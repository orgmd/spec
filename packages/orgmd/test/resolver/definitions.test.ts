import { describe, expect, it } from "vitest";
import type { EntryRevision, ValidatedBundle } from "../../src/model/types.js";
import { resolveContext } from "../../src/resolver/resolve.js";

function definition(id: string, scope: string, body: string): EntryRevision {
  return {
    id,
    owner: "role.editor",
    scope,
    status: "approved",
    source: "native",
    rev: 1,
    domain: "glossary",
    body,
    sourcePath: "glossary.md",
    line: 1,
    extra: {},
  };
}

function bundle(
  name: string,
  entries: readonly EntryRevision[],
  scopes: ValidatedBundle["metadata"]["scopes"] = undefined,
): ValidatedBundle {
  return {
    reference: name,
    path: name,
    isRoot: name === "root",
    metadata: {
      bundle: `org.${name}`,
      ...(scopes ? { scopes } : {}),
      lifecycle: {},
    },
    entries,
  } as unknown as ValidatedBundle;
}

function resolvedEntries(result: ReturnType<typeof resolveContext>) {
  return (
    result.value?.entries.filter(
      (value): value is Exclude<typeof value, { readonly withheld: true }> =>
        !("withheld" in value),
    ) ?? []
  );
}

describe("ordinary definition resolution", () => {
  it("uses the closest definition when every scope change narrows", () => {
    const result = resolveContext({
      path: [
        bundle("root", [definition("term.freight", "public", "Root")]),
        bundle("division", [
          definition("term.freight", "internal", "Division"),
        ]),
        bundle("repo", [
          definition("term.freight", "restricted", "Repository"),
        ]),
      ],
      clearance: ["restricted"],
      today: "2026-08-21",
    });

    expect(result.value?.resolutionErrors).toEqual([]);
    expect(resolvedEntries(result)).toMatchObject([
      {
        revision: {
          id: "term.freight",
          body: "Repository",
          scope: "restricted",
        },
        bundleIndex: 2,
      },
    ]);
  });

  it.each([
    ["restricted", "public"],
    ["hr-only", "finance-only"],
  ])(
    "rejects a closer %s -> %s widening with no ancestor fallback",
    (ancestorScope, closerScope) => {
      const customScopes = {
        "hr-only": { narrower_than: ["internal"] },
        "finance-only": { narrower_than: ["internal"] },
      } as const;
      const result = resolveContext({
        path: [
          bundle(
            "root",
            [definition("term.freight", ancestorScope, "Ancestor")],
            customScopes,
          ),
          bundle("repo", [
            definition("term.freight", closerScope, "Closer"),
            definition("term.unaffected", "public", "Unaffected"),
          ]),
        ],
        clearance: ["restricted"],
        today: "2026-08-21",
      });

      expect(result.value?.resolutionErrors).toEqual([
        {
          code: "widening",
          node: "repo",
          id: "term.freight",
          detail:
            "Closer scope does not narrow the preceding definition scope.",
        },
      ]);
      expect(
        resolvedEntries(result).map(({ revision }) => revision.id),
      ).toEqual(["term.unaffected"]);
      expect(JSON.stringify(result.value)).not.toContain("Ancestor");
    },
  );

  it("marks past revisit dates without treating today as stale", () => {
    const result = resolveContext({
      path: [
        bundle("root", [
          {
            ...definition("term.old", "public", "Old"),
            revisit: "2026-08-20",
          },
          {
            ...definition("term.today", "public", "Today"),
            revisit: "2026-08-21",
          },
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(
      Object.fromEntries(
        resolvedEntries(result).map(({ revision, staleReasons }) => [
          revision.id,
          staleReasons,
        ]),
      ),
    ).toEqual({ "term.old": ["revisit"], "term.today": [] });
  });
});
