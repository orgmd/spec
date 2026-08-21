import { describe, expect, it } from "vitest";
import {
  resolveContext,
  type EntryRevision,
  type ValidatedBundle,
} from "../../src/index.js";

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
  it.each([
    null,
    {
      path: [bundle("root", [entry("term.root")])],
      clearance: null,
      today: "2026-08-21",
    },
  ])("never throws for a malformed request envelope", (malformed) => {
    expect(() =>
      resolveContext(
        malformed as unknown as Parameters<typeof resolveContext>[0],
      ),
    ).not.toThrow();
    const result = resolveContext(
      malformed as unknown as Parameters<typeof resolveContext>[0],
    );
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "resolution.invalid-request" }),
    );
  });

  it("never throws when malformed request data raises during inspection", () => {
    const malformed = Object.defineProperty({}, "path", {
      get(): never {
        throw new Error("untrusted request getter");
      },
    });

    expect(() =>
      resolveContext(
        malformed as unknown as Parameters<typeof resolveContext>[0],
      ),
    ).not.toThrow();
    expect(
      resolveContext(
        malformed as unknown as Parameters<typeof resolveContext>[0],
      ).diagnostics,
    ).toEqual([
      expect.objectContaining({ code: "resolution.invalid-request" }),
    ]);
  });

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

  it("returns an invalid-request diagnostic for malformed nested scope metadata", () => {
    const root = bundle("root", [entry("term.root")]);
    const malformed = {
      ...root,
      metadata: { ...root.metadata, scopes: { secret: {} } },
    } as unknown as ValidatedBundle;

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
        code: "resolution.invalid-request",
        details: { index: 0 },
      }),
    ]);
  });

  it("returns an invalid-request diagnostic for a malformed entry shape", () => {
    const root = bundle("root", [entry("term.root")]);
    const malformed = {
      ...root,
      entries: [{ id: "term.incomplete" }],
    } as unknown as ValidatedBundle;

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
        code: "resolution.invalid-request",
        details: { index: 0 },
      }),
    ]);
  });

  it("rejects an incomplete nested lifecycle record instead of resolving it", () => {
    const root = bundle("root", [entry("term.root")]);
    const malformed = {
      ...root,
      metadata: {
        ...root.metadata,
        lifecycle: { "term.root": {} },
      },
    } as unknown as ValidatedBundle;

    const result = resolveContext({
      path: [malformed],
      clearance: ["public"],
      today: "2026-08-21",
    });
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "resolution.invalid-request",
        details: { index: 0 },
      }),
    ]);
  });

  it("rejects incomplete conditional upstream metadata instead of resolving it", () => {
    const root = bundle("root", [
      entry("term.root", {
        source: "synced:notion",
        upstream: {},
      }),
    ]);

    const result = resolveContext({
      path: [root],
      clearance: ["public"],
      today: "2026-08-21",
    });
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "resolution.invalid-request",
        details: { index: 0 },
      }),
    ]);
  });

  it("rejects an approved decision without its mandatory revisit date", () => {
    const result = resolveContext({
      path: [
        bundle("root", [
          entry("decision.missing-revisit", { domain: "decision" }),
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "resolution.invalid-request",
        details: { index: 0 },
      }),
    ]);
  });

  it("rejects an approved policy without its mandatory revisit date", () => {
    const result = resolveContext({
      path: [
        bundle("root", [
          entry("policy.missing-revisit", {
            domain: "policy",
            action: "billing.refund",
            effect: "deny",
          }),
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "resolution.invalid-request",
        details: { index: 0 },
      }),
    ]);
  });

  it("rejects an impossible revisit calendar date", () => {
    const result = resolveContext({
      path: [
        bundle("root", [
          entry("decision.invalid-revisit", {
            domain: "decision",
            revisit: "2026-99-99",
          }),
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "resolution.invalid-request",
        details: { index: 0 },
      }),
    ]);
  });

  it.each([
    ["impossible fetched date", "notion", "2026-99-99"],
    ["source/upstream system mismatch", "airtable", "2026-08-21"],
  ])("rejects synced upstream with %s", (_label, system, fetched) => {
    const result = resolveContext({
      path: [
        bundle("root", [
          entry("term.synced", {
            source: "synced:notion",
            upstream: {
              system,
              ref: "page-1",
              fetched,
              digest: "sha256:upstream",
            },
          }),
        ]),
      ],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "resolution.invalid-request",
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
