import { describe, expect, it } from "vitest";
import { doctorBundle } from "../../src/doctor/doctor.js";
import type { EntryRevision, ValidatedBundle } from "../../src/index.js";

function entry(
  id: string,
  source: EntryRevision["source"],
  domain: EntryRevision["domain"] = "glossary",
): EntryRevision {
  return {
    id,
    owner: "role.editor",
    scope: "public",
    status: "approved",
    source,
    rev: 1,
    domain,
    body: id,
    sourcePath: `${domain}.md`,
    line: 1,
    extra: {},
    ...(source.startsWith("synced:")
      ? {
          upstream: {
            system: source.slice("synced:".length),
            ref: id,
            fetched: "2026-08-21",
            digest: `sha256:${id}`,
          },
        }
      : {}),
  };
}

function report(entries: readonly EntryRevision[]) {
  return doctorBundle({
    bundle: {
      reference: "fixture",
      path: "fixture",
      isRoot: true,
      metadata: { lifecycle: {} },
      entries,
    } as unknown as ValidatedBundle,
    today: "2026-08-21",
  });
}

describe("doctor domain ratios", () => {
  it("uses integer effective-entry counts and two-decimal synced percentages", () => {
    expect(
      report([
        entry("term.one", "native"),
        entry("term.two", "synced:notion"),
        entry("term.three", "synced:linear"),
      ]).ratios,
    ).toEqual([
      { domain: "glossary", native: 1, synced: 2, syncedPercent: 66.67 },
    ]);
  });

  it("returns zero rather than NaN when a domain has no native or synced entries", () => {
    const ratios = report([entry("term.other", "unknown-source")]).ratios;

    expect(ratios).toEqual([
      { domain: "glossary", native: 0, synced: 0, syncedPercent: 0 },
    ]);
    expect(Number.isNaN(ratios[0]?.syncedPercent)).toBe(false);
  });

  it("orders ratios by domain", () => {
    const result = report([
      entry("term.active", "native"),
      entry("decision.proposed", "synced:notion", "decision"),
      {
        ...entry("decision.proposed", "synced:notion", "decision"),
        status: "draft",
      },
      entry("policy.retired", "synced:notion", "policy"),
    ]);
    expect(result.ratios.map(({ domain }) => domain)).toEqual([
      "decision",
      "glossary",
      "policy",
    ]);
  });
});
