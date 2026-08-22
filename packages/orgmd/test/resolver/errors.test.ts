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
  it.each(["2026-02-30", "not-a-date", ""])(
    "rejects invalid temporal resolution input %j",
    (today) => {
      const result = resolveContext({
        path: [bundle("root", [entry("term.root")])],
        clearance: ["public"],
        today,
      });

      expect(result.value).toBeUndefined();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: "resolution.invalid-request" }),
      ]);
    },
  );

  it.each([
    [
      "negative index",
      [{ bundleIndex: -1, code: "unparseable_bundle", detail: "failed" }],
    ],
    [
      "out-of-range index",
      [{ bundleIndex: 1, code: "unparseable_bundle", detail: "failed" }],
    ],
    ["unknown code", [{ bundleIndex: 0, code: "unknown", detail: "failed" }]],
    [
      "blank detail",
      [{ bundleIndex: 0, code: "integrity_failure", detail: " " }],
    ],
    [
      "duplicate index",
      [
        { bundleIndex: 0, code: "integrity_failure", detail: "one" },
        { bundleIndex: 0, code: "unparseable_bundle", detail: "two" },
      ],
    ],
  ])("rejects a bundle failure overlay with %s", (_label, bundleFailures) => {
    const result = resolveContext({
      path: [bundle("root", [entry("term.root")])],
      clearance: ["public"],
      today: "2026-08-21",
      bundleFailures,
    } as Parameters<typeof resolveContext>[0]);

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "resolution.invalid-request" }),
    ]);
  });

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
  it("applies a bundle failure to every contributed id without suppressing unrelated nodes", () => {
    const path = [
      bundle("root", [entry("term.shared"), entry("term.root")]),
      bundle("division", [
        entry("term.shared"),
        entry("term.child-only"),
        entry("policy.failed", {
          domain: "policy",
          revisit: "2027-01-01",
          action: "Bad.*",
          effect: "deny",
        }),
      ]),
      bundle("repo", [entry("term.shared"), entry("term.leaf")]),
    ];
    const baseline = resolveContext({
      path,
      clearance: ["public"],
      today: "2026-08-21",
    });
    const result = resolveContext({
      path,
      clearance: ["public"],
      today: "2026-08-21",
      bundleFailures: [
        {
          bundleIndex: 1,
          code: "unparseable_bundle",
          detail: "The designated bundle could not be parsed.",
        },
      ],
    });

    expect(
      result.value?.entries.flatMap((resolved) =>
        "withheld" in resolved ? [] : [resolved.revision.id],
      ),
    ).toEqual(["term.leaf", "term.root"]);
    expect(result.value?.resolutionErrors).toEqual([
      {
        code: "unparseable_bundle",
        node: "division",
        id: "policy.failed",
        detail: "The designated bundle could not be parsed.",
      },
      {
        code: "unparseable_bundle",
        node: "division",
        id: "term.child-only",
        detail: "The designated bundle could not be parsed.",
      },
      {
        code: "unparseable_bundle",
        node: "division",
        id: "term.shared",
        detail: "The designated bundle could not be parsed.",
      },
    ]);
    expect(result.value?.contextId).not.toBe(baseline.value?.contextId);
  });

  it("names an empty failed bundle and withholds above-clearance contributed ids", () => {
    const empty = resolveContext({
      path: [bundle("root", [])],
      clearance: ["public"],
      today: "2026-08-21",
      bundleFailures: [
        {
          bundleIndex: 0,
          code: "integrity_failure",
          detail: "Bundle integrity verification failed.",
        },
      ],
    });
    const restricted = resolveContext({
      path: [bundle("root", [entry("term.secret", { scope: "restricted" })])],
      clearance: ["public"],
      today: "2026-08-21",
      bundleFailures: [
        {
          bundleIndex: 0,
          code: "integrity_failure",
          detail: "Bundle integrity verification failed.",
        },
      ],
    });

    expect(empty.value?.resolutionErrors).toEqual([
      {
        code: "integrity_failure",
        node: "root",
        id: "org.root",
        detail: "Bundle integrity verification failed.",
      },
    ]);
    expect(restricted.value?.resolutionErrors).toEqual([
      {
        code: "integrity_failure",
        node: "root",
        id_withheld: true,
        detail: "Bundle integrity verification failed.",
      },
    ]);
  });

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
