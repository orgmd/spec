import { describe, expect, it } from "vitest";
import type { EntryRevision, ValidatedBundle } from "../../src/model/types.js";
import { resolveContext } from "../../src/resolver/resolve.js";

function authority(
  id: string,
  body: string,
  overrides: Partial<EntryRevision> = {},
): EntryRevision {
  return {
    id,
    owner: "role.board",
    scope: "public",
    status: "approved",
    source: "native",
    rev: 1,
    domain: "ownership",
    body,
    sourcePath: "ownership.md",
    line: 1,
    extra: {},
    ...overrides,
  };
}

function bundle(
  path: string,
  entries: readonly EntryRevision[],
): ValidatedBundle {
  return {
    reference: `${path}-reference`,
    path,
    isRoot: path === "root",
    metadata: { bundle: `org.${path.replaceAll("/", ".")}`, lifecycle: {} },
    entries,
  } as unknown as ValidatedBundle;
}

function resolve(path: readonly ValidatedBundle[]) {
  const result = resolveContext({
    path,
    clearance: ["restricted"],
    today: "2026-08-21",
  });
  if (!result.value) throw new Error("expected effective context");
  return result.value;
}

function visible(context: ReturnType<typeof resolve>) {
  return context.entries.filter(
    (entry): entry is Exclude<typeof entry, { readonly withheld: true }> =>
      !("withheld" in entry),
  );
}

describe("authority-bounded resolution", () => {
  it("keeps anchored ownership and reports the exact unauthorized shadow node", () => {
    const context = resolve([
      bundle("root", [authority("own.payments", "Board")]),
      bundle("division", [
        authority("own.payments", "Division", { owner: "role.division" }),
      ]),
    ]);

    expect(visible(context)).toMatchObject([
      { revision: { id: "own.payments", body: "Board" }, bundleIndex: 0 },
    ]);
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "resolution.unauthorised-shadow",
        entryId: "own.payments",
        path: "division",
      }),
    );
  });

  it("allows one-level ownership delegation only inside the named subtree", () => {
    const root = bundle("root", [
      authority("own.payments", "Board", { delegates: ["division"] }),
    ]);
    const division = bundle("division", [
      authority("own.payments", "Division", { owner: "role.division" }),
    ]);

    expect(
      visible(resolve([root, division, bundle("division/repo", [])]))[0]
        ?.revision.body,
    ).toBe("Division");
    expect(
      visible(resolve([root, bundle("other", [])]))[0]?.revision.body,
    ).toBe("Board");
  });

  it("does not apply a delegated branch entry to a consumer on an interleaved sibling branch", () => {
    const context = resolve([
      bundle("root", [
        authority("own.payments", "Board", { delegates: ["division/a"] }),
      ]),
      bundle("division/a", [
        authority("own.payments", "Division A", { owner: "role.a" }),
      ]),
      bundle("division/b", []),
    ]);

    expect(visible(context)[0]?.revision.body).toBe("Board");
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "resolution.unauthorised-shadow",
        path: "division/a",
      }),
    );
  });

  it("uses the closest delegated ownership entry but ignores delegated re-delegation", () => {
    const context = resolve([
      bundle("root", [
        authority("own.payments", "Board", { delegates: ["division"] }),
      ]),
      bundle("division", [
        authority("own.payments", "Division", {
          owner: "role.division",
          delegates: ["division/team"],
        }),
      ]),
      bundle("division/team", [
        authority("own.payments", "Team", { owner: "role.team" }),
      ]),
    ]);

    expect(visible(context)[0]?.revision.body).toBe("Team");
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "resolution.ignored-delegates",
        entryId: "own.payments",
        path: "division",
      }),
    );
  });

  it("ignores self-delegation and leaves the closer entry unauthorized", () => {
    const context = resolve([
      bundle("root", [
        authority("own.payments", "Board", { delegates: ["root"] }),
      ]),
      bundle("division", [authority("own.payments", "Division")]),
    ]);

    expect(visible(context)[0]?.revision.body).toBe("Board");
    expect(context.diagnostics.map(({ code }) => code).sort()).toEqual([
      "resolution.ignored-delegates",
      "resolution.unauthorised-shadow",
    ]);
    expect(visible(context)[0]?.revision.delegates).toBeUndefined();
  });

  it("never delegates decisions and reports both the ignored delegation and shadow", () => {
    const context = resolve([
      bundle("root", [
        authority("dec.014", "Board decision", {
          domain: "decision",
          delegates: ["division"],
          revisit: "2027-01-01",
          sourcePath: "decisions/DEC-0014.md",
        }),
      ]),
      bundle("division", [
        authority("dec.014", "Division decision", {
          domain: "decision",
          revisit: "2027-01-01",
          sourcePath: "decisions/DEC-0014.md",
        }),
      ]),
    ]);

    expect(visible(context)[0]?.revision.body).toBe("Board decision");
    expect(context.diagnostics.map(({ code }) => code).sort()).toEqual([
      "resolution.ignored-delegates",
      "resolution.unauthorised-shadow",
    ]);
    expect(visible(context)[0]?.revision.delegates).toBeUndefined();
  });

  it("does not let ownership delegation authorize a decision-domain replacement", () => {
    const context = resolve([
      bundle("root", [
        authority("own.payments", "Board", { delegates: ["division"] }),
      ]),
      bundle("division", [
        authority("own.payments", "Pretend decision", {
          domain: "decision",
          revisit: "2027-01-01",
          sourcePath: "decisions/DEC-PAYMENTS.md",
        }),
      ]),
    ]);

    expect(visible(context)[0]?.revision.body).toBe("Board");
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "resolution.unauthorised-shadow",
        path: "division",
      }),
    );
  });

  it("permits a payload-preserving scope narrowing without delegation", () => {
    const context = resolve([
      bundle("root", [authority("own.payments", "Board")]),
      bundle("division", [
        authority("own.payments", "Board", { scope: "internal" }),
      ]),
    ]);

    expect(context.resolutionErrors).toEqual([]);
    expect(context.diagnostics).toEqual([]);
    expect(visible(context)).toMatchObject([
      {
        revision: { id: "own.payments", body: "Board", scope: "internal" },
        bundleIndex: 1,
      },
    ]);
  });

  it("ignores revision bookkeeping and unknown keys when recognizing authority scope narrowing", () => {
    const context = resolve([
      bundle("root", [authority("own.payments", "Board")]),
      bundle("division", [
        authority("own.payments", "Board", {
          scope: "internal",
          rev: 2,
          extra: { extension_note: "local bookkeeping" },
        }),
      ]),
    ]);

    expect(context.resolutionErrors).toEqual([]);
    expect(context.diagnostics).toEqual([]);
    expect(visible(context)).toMatchObject([
      {
        revision: { id: "own.payments", scope: "internal", rev: 2 },
        bundleIndex: 1,
      },
    ]);
  });

  it("does not disclose a hidden unauthorized authority id in diagnostics", () => {
    const result = resolveContext({
      path: [
        bundle("root", [
          authority("own.acquisition-secret", "Project Kestrel board", {
            scope: "restricted",
          }),
        ]),
        bundle("division", [
          authority("own.acquisition-secret", "Project Kestrel division", {
            scope: "public",
            owner: "role.division",
          }),
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value?.diagnostics).toEqual([
      expect.objectContaining({
        code: "resolution.unauthorised-shadow",
        path: "division",
        message: "An authority entry above this clearance was discarded.",
      }),
    ]);
    expect(result.value?.diagnostics[0]?.entryId).toBeUndefined();
    const rendered = JSON.stringify({
      context: result.value,
      diagnostics: result.diagnostics,
    });
    expect(rendered).not.toContain("own.acquisition-secret");
    expect(rendered).not.toContain("Project Kestrel");
    expect(rendered).not.toContain("restricted");
  });

  it("fails an authority id whose scope widens and does not fall back", () => {
    const context = resolve([
      bundle("root", [
        authority("own.payments", "Board", { scope: "internal" }),
        authority("own.unaffected", "Unchanged"),
      ]),
      bundle("division", [
        authority("own.payments", "Board", { scope: "public" }),
      ]),
    ]);

    expect(context.resolutionErrors).toContainEqual(
      expect.objectContaining({ code: "widening", id: "own.payments" }),
    );
    expect(visible(context).map(({ revision }) => revision.id)).toEqual([
      "own.unaffected",
    ]);
    expect(JSON.stringify(context)).not.toContain('"body":"Board"');
  });

  it("anchors a new authority id where it is first introduced", () => {
    const context = resolve([
      bundle("root", []),
      bundle("division", [authority("own.payments", "Division")]),
      bundle("division/repo", [authority("own.payments", "Repository")]),
    ]);

    expect(visible(context)[0]?.revision.body).toBe("Division");
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "resolution.unauthorised-shadow",
        path: "division/repo",
      }),
    );
  });
});
