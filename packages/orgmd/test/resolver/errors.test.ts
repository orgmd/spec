import { describe, expect, it } from "vitest";
import type { EntryRevision, ValidatedBundle } from "../../src/model/types.js";
import { resolveContext } from "../../src/resolver/resolve.js";

function entry(
  id: string,
  overrides: Partial<EntryRevision> = {},
): EntryRevision {
  return {
    id,
    owner: "role.editor",
    scope: "public",
    status: "approved",
    source: "native",
    rev: 1,
    domain: "glossary",
    body: id,
    sourcePath: "glossary.md",
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

describe("resolution request failures", () => {
  it("refuses an empty path without producing a partial context", () => {
    const result = resolveContext({
      path: [],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "resolution.ambiguous-path" }),
    );
  });

  it("refuses a duplicate bundle path without producing a partial context", () => {
    const root = bundle("root", [entry("term.root")]);
    const result = resolveContext({
      path: [root, root],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "resolution.duplicate-path",
        path: "root",
      }),
    );
  });

  it("refuses an unreachable node without attempting a subset", () => {
    const root = bundle("root", [entry("term.root")]);
    const result = resolveContext({
      path: [root, undefined] as unknown as readonly ValidatedBundle[],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unreachable_node" }),
    );
  });

  it("returns a stable request error for a malformed object node instead of throwing", () => {
    const malformed = { isRoot: true } as unknown as ValidatedBundle;

    expect(() =>
      resolveContext({
        path: [malformed],
        clearance: ["public"],
        today: "2026-08-21",
      }),
    ).not.toThrow();
    const result = resolveContext({
      path: [malformed],
      clearance: ["public"],
      today: "2026-08-21",
    });
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "unreachable_node",
        details: { index: 0 },
      }),
    ]);
  });

  it("requires the path to start at one root and continue with non-root nodes", () => {
    const nonRoot = bundle("division", []);
    const laterRoot = bundle("root", []);
    const result = resolveContext({
      path: [nonRoot, laterRoot],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "resolution.invalid-path" }),
    );
  });
});

describe("resolution error disclosure and determinism", () => {
  it("withholds an above-clearance id and keeps a fixed disclosure-safe detail", () => {
    const result = resolveContext({
      path: [
        bundle("root", [
          entry("policy.acquisition-secret", {
            domain: "policy",
            scope: "restricted",
            revisit: "2027-01-01",
            action: "Billing.*",
            effect: "deny",
            sourcePath: "policies.md",
            body: "Never disclose Project Kestrel",
          }),
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value?.resolutionErrors).toEqual([
      {
        code: "invalid_action",
        node: "root",
        id_withheld: true,
        detail: "An entry has an invalid action value.",
      },
    ]);
    const rendered = JSON.stringify(result.value?.resolutionErrors);
    expect(rendered).not.toContain("policy.acquisition-secret");
    expect(rendered).not.toContain("Project Kestrel");
    expect(rendered).not.toContain("restricted");
    expect(rendered).not.toContain("Billing.*");
  });

  it("sorts errors by bytewise node, visible id or empty string, then code", () => {
    const result = resolveContext({
      path: [
        bundle("root", [
          entry("policy.visible", {
            domain: "policy",
            revisit: "2027-01-01",
            action: "Visible.*",
            effect: "deny",
          }),
          entry("policy.hidden", {
            domain: "policy",
            scope: "restricted",
            revisit: "2027-01-01",
            action: "Hidden.*",
            effect: "deny",
          }),
        ]),
        bundle("a-node", [
          entry("policy.node", {
            domain: "policy",
            revisit: "2027-01-01",
            action: "Node.*",
            effect: "deny",
          }),
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(
      result.value?.resolutionErrors.map(({ node, id, code }) => [
        node,
        id ?? "",
        code,
      ]),
    ).toEqual([
      ["a-node", "policy.node", "invalid_action"],
      ["root", "", "invalid_action"],
      ["root", "policy.visible", "invalid_action"],
    ]);
  });
});
