import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repository = new URL("../../../..", import.meta.url).pathname;
const read = (file: string) => readFileSync(resolve(repository, file), "utf8");
const results = JSON.parse(read("site/playground/results.json")) as Results;

describe("public playground", () => {
  it("keeps a draft pending while the approved policy remains effective", () => {
    const current = results.states.current;
    const draft = results.states.draft;

    expect(policy(current)).toMatchObject({
      rev: 1,
      route: "own.ops-duty-manager",
    });
    expect(policy(draft)).toMatchObject({
      rev: 1,
      route: "own.ops-duty-manager",
    });
    expect(draft.doctor.pendingRevisions).toBe(1);
    expect(draft.doctor.findings).toContainEqual(
      expect.objectContaining({
        code: "doctor.pending-revision",
        blocking: false,
      }),
    );
    expect(policySection(current)).toBe(policySection(draft));
    expect(draft.resolution.contextId).not.toBe(current.resolution.contextId);
    expect(draft.resolution.bundles[0]?.contentId).not.toBe(
      current.resolution.bundles[0]?.contentId,
    );
  });

  it("makes the newer policy effective only in the recorded ratified state", () => {
    const ratified = results.states.ratified;

    expect(policy(ratified)).toMatchObject({
      rev: 2,
      route: "own.duty-operations-lead",
    });
    expect(ratified.doctor.pendingRevisions).toBe(0);
    expect(policySection(ratified)).toContain("revision: `2`");
    expect(policySection(ratified)).toContain("own.duty-operations-lead");
  });

  it("publishes deterministic provenance without checkout details", () => {
    const serialized = JSON.stringify(results);

    expect(results.provenance).toMatchObject({
      orgmdVersion: "0.5.0",
      specVersion: "0.3.1-draft",
      implementationCommit: "7005ffe359e5454ce44c18da9007d278221e295d",
      implementationDigest:
        "sha256:daa0102422964c5d358bc4f55333e1ec79ed313019aca1ba6af8b1ba2a1003f9",
    });
    expect(results.demo).toMatchObject({
      today: "2026-08-21",
      clearance: ["public"],
      stateOrder: ["current", "draft", "ratified"],
    });
    expect(serialized).not.toContain(repository);
    expect(serialized).not.toMatch(/generatedAt|new Date/u);
  });

  it("labels the browser as a static advisory replay", () => {
    const page = read("site/playground/index.html");

    expect(page).toContain("Generated at build time from the public fixture");
    expect(page).toContain("The browser replays saved results");
    expect(page).toContain("advisory");
    expect(page).not.toMatch(
      /innerHTML|insertAdjacentHTML|eval\(|new Function/u,
    );
  });
});

function policy(state: State): EffectiveEntry {
  const entry = state.resolution.effectiveEntries.find(
    ({ id }) => id === "policy.delivery-window",
  );
  if (!entry) throw new Error("Effective policy is missing");
  return entry;
}

function policySection(state: State): string {
  const content = state.projections["agents-md"].content;
  const start = content.indexOf("#### `policy.delivery-window`");
  if (start < 0) throw new Error("Compiled policy section is missing");
  return content.slice(start).replace("<!-- orgmd:end -->\n", "");
}

interface EffectiveEntry {
  readonly id: string;
  readonly rev: number;
  readonly route?: string;
}

interface State {
  readonly doctor: {
    readonly pendingRevisions: number;
    readonly findings: readonly {
      readonly code: string;
      readonly blocking: boolean;
    }[];
  };
  readonly resolution: {
    readonly contextId: string;
    readonly bundles: readonly { readonly contentId: string }[];
    readonly effectiveEntries: readonly EffectiveEntry[];
  };
  readonly projections: {
    readonly "agents-md": { readonly content: string };
  };
}

interface Results {
  readonly demo: {
    readonly today: string;
    readonly clearance: readonly string[];
    readonly stateOrder: readonly string[];
  };
  readonly provenance: {
    readonly orgmdVersion: string;
    readonly specVersion: string;
    readonly implementationCommit: string;
    readonly implementationDigest: string;
  };
  readonly states: {
    readonly current: State;
    readonly draft: State;
    readonly ratified: State;
  };
}
