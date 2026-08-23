import { describe, expect, it } from "vitest";
import { computeContentId } from "../../src/identifiers/content-id.js";
import type { EntryRevision, ValidatedBundle } from "../../src/model/types.js";
import { resolveContext } from "../../src/resolver/resolve.js";
import { serializeEffectiveContext } from "../../src/resolver/serialize.js";

function entry(id: string, scope = "public"): EntryRevision {
  return {
    id,
    owner: "role.editor",
    scope,
    status: "approved",
    source: "native",
    rev: 1,
    domain: "glossary",
    body: `${id} body`,
    sourcePath: "glossary.md",
    line: 1,
    extra: {},
  };
}

function bundle(entries: readonly EntryRevision[]): ValidatedBundle {
  return {
    reference: "root-reference",
    path: "root",
    isRoot: true,
    metadata: { bundle: "org.root", lifecycle: {} },
    entries,
  } as unknown as ValidatedBundle;
}

function resolveOk(value: ValidatedBundle) {
  const result = resolveContext({
    path: [value],
    clearance: ["public"],
    today: "2026-08-21",
  });
  if (!result.value) throw new Error("expected resolved context");
  return result.value;
}

describe("effective-context serialization", () => {
  it("orders stacked same-id contributors by root-to-node bundle position", () => {
    const rootRevision = {
      ...entry("policy.shared"),
      domain: "policy",
      body: "Root rule.",
      action: "billing.*",
      effect: "allow" as const,
      revisit: "2027-01-01",
    };
    const leafRevision = {
      ...rootRevision,
      body: "Leaf rule.",
      action: "billing.refund",
      effect: "deny" as const,
    };
    const serialized = serializeEffectiveContext({
      contextId: "sha256:context",
      bundles: [
        { bundleId: "root", path: "root", contentId: "sha256:root" },
        { bundleId: "leaf", path: "root/leaf", contentId: "sha256:leaf" },
      ],
      entries: [
        {
          revision: leafRevision,
          bundleIndex: 1,
          contested: false,
          staleReasons: [],
        },
        {
          revision: rootRevision,
          bundleIndex: 0,
          contested: false,
          staleReasons: [],
        },
      ],
      resolutionErrors: [],
      diagnostics: [],
    });

    expect(
      (JSON.parse(serialized) as { entries: { body: string }[] }).entries.map(
        ({ body }) => body,
      ),
    ).toEqual(["Root rule.", "Leaf rule."]);
  });

  it("changes context identity when the resolution date changes staleness", () => {
    const root = bundle([
      {
        ...entry("term.temporal"),
        revisit: "2027-01-01",
      },
    ]);
    const current = resolveContext({
      path: [root],
      clearance: ["public"],
      today: "2026-08-21",
    });
    const stale = resolveContext({
      path: [root],
      clearance: ["public"],
      today: "2028-08-21",
    });
    if (!current.value || !stale.value)
      throw new Error("expected resolved contexts");

    expect(current.value.contextId).not.toBe(stale.value.contextId);
    expect(
      current.value.entries.flatMap((value) =>
        "revision" in value ? value.staleReasons : [],
      ),
    ).toEqual([]);
    expect(
      stale.value.entries.flatMap((value) =>
        "revision" in value ? value.staleReasons : [],
      ),
    ).toEqual(["revisit"]);
  });

  it("serializes only visible canonical entries and bundle versions", () => {
    const root = bundle([entry("term.alpha")]);
    const context = resolveOk(root);
    const expected = `{"bundles":[{"content_id":${JSON.stringify(
      computeContentId(root),
    )},"path":"root"}],"entries":[{"body":"term.alpha body","domain":"glossary","id":"term.alpha","owner":"role.editor","rev":1,"scope":"public","source":"native","status":"approved"}]}`;

    expect(serializeEffectiveContext(context)).toBe(expected);
    expect(serializeEffectiveContext(context)).not.toContain("bundleIndex");
    expect(serializeEffectiveContext(context)).not.toContain("contested");
    expect(serializeEffectiveContext(context)).not.toContain("staleReasons");
  });

  it("is byte-identical across file and entry permutations", () => {
    const variants = [
      [
        entry("term.zeta"),
        entry("term.alpha"),
        entry("term.hidden", "internal"),
      ],
      [
        entry("term.hidden", "internal"),
        entry("term.zeta"),
        entry("term.alpha"),
      ],
      [
        entry("term.alpha"),
        entry("term.hidden", "internal"),
        entry("term.zeta"),
      ],
    ];
    const outputs = variants.map((entries) => {
      const root = bundle(entries);
      const result = resolveContext({
        path: [root],
        clearance: ["public"],
        today: "2026-08-21",
      });
      if (!result.value) throw new Error("expected resolved context");
      return {
        id: result.value.contextId,
        bytes: serializeEffectiveContext(result.value),
        markers: result.value.entries.filter((value) => "withheld" in value)
          .length,
        diagnostics: result.value.diagnostics,
        errors: result.value.resolutionErrors,
      };
    });

    expect(new Set(outputs.map(({ bytes }) => bytes)).size).toBe(1);
    expect(new Set(outputs.map(({ id }) => id)).size).toBe(1);
    expect(new Set(outputs.map(({ markers }) => markers))).toEqual(
      new Set([1]),
    );
    expect(outputs.every(({ diagnostics }) => diagnostics.length === 0)).toBe(
      true,
    );
    expect(outputs.every(({ errors }) => errors.length === 0)).toBe(true);
  });

  it("repeats identically at least 25 times", () => {
    const root = bundle([
      entry("term.visible"),
      entry("term.withheld", "restricted"),
    ]);
    const outputs = Array.from({ length: 25 }, () => {
      const context = resolveOk(root);
      return JSON.stringify({
        contextId: context.contextId,
        bytes: serializeEffectiveContext(context),
        markers: context.entries.filter((value) => "withheld" in value).length,
        diagnostics: context.diagnostics,
        errors: context.resolutionErrors,
      });
    });

    expect(new Set(outputs).size).toBe(1);
  });
});
