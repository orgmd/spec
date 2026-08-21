import { describe, expect, it } from "vitest";
import type {
  BundleMetadata,
  EntryRevision,
  ValidatedBundle,
} from "../../src/model/types.js";
import { createScopeLattice } from "../../src/resolver/scopes.js";
import { resolveContext } from "../../src/resolver/resolve.js";

function entry(id: string, scope: string, body = id): EntryRevision {
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
  scopes?: BundleMetadata["scopes"],
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

describe("scope lattice", () => {
  it("computes default and custom reflexive-transitive narrowing", () => {
    const result = createScopeLattice({
      "hr-only": { narrower_than: ["internal"] },
      "hr-exec": { narrower_than: ["hr-only"] },
      "finance-only": { narrower_than: ["internal"] },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.narrowerOrEqual("restricted", "public")).toBe(true);
    expect(result.value?.narrowerOrEqual("hr-exec", "public")).toBe(true);
    expect(result.value?.narrowerOrEqual("hr-only", "finance-only")).toBe(
      false,
    );
    expect(result.value?.visible("public", ["internal"])).toBe(true);
    expect(result.value?.visible("restricted", ["public"])).toBe(false);
  });

  it("rejects cyclic and unknown custom-scope edges", () => {
    const cycle = createScopeLattice({
      alpha: { narrower_than: ["beta"] },
      beta: { narrower_than: ["alpha"] },
    });
    const unknown = createScopeLattice({
      alpha: { narrower_than: ["undeclared"] },
    });

    expect(cycle.value).toBeUndefined();
    expect(cycle.diagnostics.map(({ code }) => code)).toEqual([
      "resolution.scope-cycle",
    ]);
    expect(unknown.value).toBeUndefined();
    expect(unknown.diagnostics.map(({ code }) => code)).toEqual([
      "resolution.unknown-scope",
    ]);
  });
});

describe("Core Mode A disclosure", () => {
  it("requires clearance except for explicitly anonymous public resolution", () => {
    const root = bundle("root", [entry("term.visible", "public")]);
    const denied = resolveContext({
      path: [root],
      clearance: [],
      today: "2026-08-21",
    });
    const anonymous = resolveContext({
      path: [root],
      clearance: [],
      anonymous: true,
      today: "2026-08-21",
    });

    expect(denied.value).toBeUndefined();
    expect(denied.diagnostics.map(({ code }) => code)).toEqual([
      "resolution.empty-clearance",
    ]);
    expect(anonymous.value?.entries).toHaveLength(1);
  });

  it("withholds a winning definition without exposing an ancestor shadow", () => {
    const root = bundle("root", [
      entry("term.payments", "public", "Root public meaning"),
    ]);
    const leaf = bundle("leaf", [
      entry("term.payments", "restricted", "Leaf restricted meaning"),
    ]);

    const result = resolveContext({
      path: [root, leaf],
      clearance: ["public"],
      today: "2026-08-21",
    });

    expect(result.value?.entries).toEqual([
      { withheld: true, reason: "clearance" },
    ]);
    expect(JSON.stringify(result.value)).not.toContain("Root public meaning");
    expect(JSON.stringify(result.value)).not.toContain("term.payments");
    expect(JSON.stringify(result.value)).not.toContain("restricted");
  });
});
