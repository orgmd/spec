import { describe, expect, it } from "vitest";
import type {
  Bundle,
  Domain,
  ParsedEntryRevision,
} from "../../src/model/types.js";
import { validateBundle } from "../../src/validation/validate.js";

const frontMatter = (
  id: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> => ({
  id,
  owner: "role.editor",
  scope: "public",
  status: "approved",
  source: "native",
  rev: 1,
  ...overrides,
});

const parsed = (
  domain: Domain,
  values: Readonly<Record<string, unknown>>,
  sourcePath = `${domain}.md`,
  line = 1,
): ParsedEntryRevision => ({
  frontMatter: values,
  body: `Body for ${String(values.id)}`,
  domain,
  sourcePath,
  line,
});

const identity = (
  overrides: Readonly<Record<string, unknown>> = {},
): ParsedEntryRevision =>
  parsed("identity", frontMatter("org.identity", overrides), "org.md");

const lastResort = (): ParsedEntryRevision =>
  parsed("ownership", frontMatter("own.last-resort"), "ownership.md");

const bundle = (
  entries: readonly ParsedEntryRevision[],
  options: {
    readonly isRoot?: boolean;
    readonly identityEntry?: ParsedEntryRevision;
  } = {},
): Bundle => {
  const identityEntry = options.identityEntry ?? identity();
  const isRoot = options.isRoot ?? true;
  return {
    reference: "fixture",
    path: "/fixture",
    isRoot,
    identityMetadata: identityEntry.frontMatter,
    entries: [identityEntry, ...(isRoot ? [lastResort()] : []), ...entries],
  };
};

const codes = (result: ReturnType<typeof validateBundle>): readonly string[] =>
  result.diagnostics.map(({ code }) => code);

describe("semantic bundle validation", () => {
  it("requires revisit on decisions and policies", () => {
    const result = validateBundle(
      bundle([
        parsed(
          "policy",
          frontMatter("policy.no-review", {
            action: "payments.review",
            effect: "deny",
          }),
          "policies.md",
        ),
        parsed(
          "decision",
          frontMatter("dec.no-review"),
          "decisions/no-review.md",
        ),
      ]),
      { isRoot: true },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "validation.missing-revisit",
        entryId: "policy.no-review",
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "validation.missing-revisit",
        entryId: "dec.no-review",
      }),
    );
    expect(result.value).toBeUndefined();
  });

  it("accepts multiple revisions of an id and rejects only duplicate (id, rev) pairs", () => {
    const revisionOne = parsed(
      "glossary",
      frontMatter("term.freight", { rev: 1, extension: "retained" }),
      "glossary.md",
      1,
    );
    const revisionTwo = parsed(
      "glossary",
      frontMatter("term.freight", { rev: 2, status: "draft" }),
      "glossary.md",
      10,
    );

    const valid = validateBundle(bundle([revisionOne, revisionTwo]), {
      isRoot: true,
    });
    expect(valid.diagnostics).toEqual([]);
    expect(
      valid.value?.entries.filter(({ id }) => id === "term.freight"),
    ).toMatchObject([
      { rev: 1, status: "approved", extra: { extension: "retained" } },
      { rev: 2, status: "draft", extra: {} },
    ]);

    const duplicate = validateBundle(
      bundle([
        revisionOne,
        revisionTwo,
        parsed(
          "glossary",
          frontMatter("term.freight", { rev: 2, status: "rejected" }),
          "glossary.md",
          20,
        ),
      ]),
      { isRoot: true },
    );
    expect(duplicate.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "validation.duplicate-rev",
        entryId: "term.freight",
      }),
    );
  });

  it("takes bundle metadata from the highest approved identity revision", () => {
    const revisionOne = identity({
      rev: 1,
      bundle: "example.old",
    });
    const revisionTwo = identity({
      rev: 2,
      status: "draft",
      bundle: "example.pending",
    });
    const revisionThree = identity({
      rev: 3,
      bundle: "example.current",
    });
    const input = bundle([revisionTwo, revisionThree], {
      identityEntry: revisionOne,
    });

    const result = validateBundle(input, { isRoot: true });

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.metadata.bundle).toBe("example.current");
  });

  it("requires policy fields, resolves escalation routes, and rejects constraint fields on definitions", () => {
    const result = validateBundle(
      bundle([
        parsed(
          "policy",
          frontMatter("policy.missing-effect", {
            revisit: "2027-01-01",
            action: "payments.read",
          }),
          "policies.md",
        ),
        parsed(
          "policy",
          frontMatter("policy.bad-route", {
            revisit: "2027-01-01",
            action: "payments.write",
            effect: "escalate",
            route: "own.missing",
          }),
          "policies.md",
          20,
        ),
        parsed(
          "glossary",
          frontMatter("term.not-a-rule", {
            action: "payments.*",
            effect: "allow",
            route: "own.last-resort",
          }),
          "glossary.md",
        ),
      ]),
      { isRoot: true },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "invalid_entry",
        entryId: "policy.missing-effect",
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "unresolvable_route",
        entryId: "policy.bad-route",
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "invalid_entry",
        entryId: "term.not-a-rule",
      }),
    );
  });

  it("normalizes valid root lifecycle, scopes, grace, and bundle metadata", () => {
    const identityEntry = identity({
      bundle: "example.root",
      scopes: {
        "hr-only": { narrower_than: ["internal"] },
        "hr-exec": { narrower_than: ["hr-only"] },
      },
      grace_days: 30,
      lifecycle: {
        "term.retired": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-21",
          ref: "records/retirement.md",
        },
      },
    });
    const result = validateBundle(
      bundle(
        [
          parsed(
            "glossary",
            frontMatter("term.retired", { scope: "hr-exec" }),
            "glossary.md",
          ),
        ],
        { identityEntry },
      ),
      { isRoot: true },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.metadata).toEqual({
      bundle: "example.root",
      scopes: {
        "hr-only": { narrower_than: ["internal"] },
        "hr-exec": { narrower_than: ["hr-only"] },
      },
      graceDays: 30,
      lifecycle: {
        "term.retired": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-21",
          ref: "records/retirement.md",
        },
      },
    });
    expect(result.value && Object.isFrozen(result.value)).toBe(true);
    expect(result.value && Object.isFrozen(result.value.entries)).toBe(true);
  });

  it("validates lifecycle references, attribution, and synced contest restrictions", () => {
    const identityEntry = identity({
      lifecycle: {
        "term.unknown": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-21",
        },
        "term.synced": {
          state: "contested",
          by: "role.editor",
          date: "2026-08-21",
          ref: "disputes/1",
        },
        "term.bad-date": {
          state: "retired",
          by: "",
          date: "2026-02-30",
        },
      },
    });
    const result = validateBundle(
      bundle(
        [
          parsed(
            "glossary",
            frontMatter("term.synced", {
              source: "synced:notion",
              upstream: {
                system: "notion",
                ref: "page:1",
                fetched: "2026-08-21",
                digest: "sha256:abc",
              },
            }),
          ),
          parsed("glossary", frontMatter("term.bad-date"), "glossary.md", 20),
        ],
        { identityEntry },
      ),
      { isRoot: true },
    );

    expect(codes(result)).toContain("validation.invalid-lifecycle-ref");
    expect(codes(result)).toContain("validation.invalid-lifecycle");
    expect(codes(result)).toContain("validation.synced-contest");
  });

  it("validates the custom-scope DAG and grace range", () => {
    const identityEntry = identity({
      scopes: {
        alpha: { narrower_than: ["beta"] },
        beta: { narrower_than: ["alpha"] },
        orphan: { narrower_than: ["undeclared"] },
      },
      grace_days: 91,
    });
    const result = validateBundle(bundle([], { identityEntry }), {
      isRoot: true,
    });

    expect(codes(result)).toContain("validation.scope-cycle");
    expect(codes(result)).toContain("validation.unknown-scope-ref");
    expect(codes(result)).toContain("validation.invalid-grace-days");
  });

  it("orders lifecycle, scope, revision, route, and root-accountability diagnostics deterministically", () => {
    const identityEntry = parsed(
      "identity",
      frontMatter("org.identity", {
        scopes: {
          alpha: { narrower_than: ["beta"] },
          beta: { narrower_than: ["alpha"] },
        },
        lifecycle: {
          a: {
            state: "retired",
            by: "role.editor",
            date: "2026-08-21",
          },
        },
      }),
      "00-org.md",
    );
    const duplicate = frontMatter("term.duplicate");
    const fixture: Bundle = {
      reference: "invalid-root-metadata",
      path: "/invalid-root-metadata",
      isRoot: true,
      identityMetadata: identityEntry.frontMatter,
      entries: [
        identityEntry,
        parsed("glossary", duplicate, "10-revisions.md"),
        parsed("glossary", duplicate, "10-revisions.md", 20),
        parsed(
          "policy",
          frontMatter("policy.bad-route", {
            revisit: "2027-01-01",
            action: "payments.write",
            effect: "escalate",
            route: "own.missing",
          }),
          "20-policies.md",
        ),
      ],
    };

    expect(codes(validateBundle(fixture, { isRoot: true }))).toEqual([
      "validation.invalid-lifecycle-ref",
      "validation.scope-cycle",
      "validation.duplicate-rev",
      "unresolvable_route",
      "validation.missing-last-resort",
    ]);
  });

  it("ignores and reports root-only metadata in a non-root bundle", () => {
    const identityEntry = identity({
      scopes: { private: { narrower_than: ["restricted"] } },
      grace_days: 10,
      lifecycle: {
        "term.local": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-21",
        },
      },
    });
    const result = validateBundle(
      bundle([parsed("glossary", frontMatter("term.local"))], {
        isRoot: false,
        identityEntry,
      }),
      { isRoot: false },
    );

    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation.ignored-root-metadata",
          severity: "warning",
          details: expect.objectContaining({ field: "scopes" }),
        }),
        expect.objectContaining({
          code: "validation.ignored-root-metadata",
          severity: "warning",
          details: expect.objectContaining({ field: "grace_days" }),
        }),
      ]),
    );
    expect(result.value?.metadata).toEqual({
      lifecycle: {
        "term.local": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-21",
        },
      },
    });
  });

  it("defers non-root routes and custom scopes to path resolution", () => {
    const result = validateBundle(
      bundle(
        [
          parsed(
            "policy",
            frontMatter("policy.inherited", {
              scope: "root-declared",
              revisit: "2027-01-01",
              action: "payments.write",
              effect: "escalate",
              route: "own.ancestor",
            }),
            "policies.md",
          ),
        ],
        { isRoot: false },
      ),
      { isRoot: false },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toBeDefined();
  });

  it("rejects malformed bundle identifiers and owner role identifiers", () => {
    const identityEntry = identity({ bundle: 42 });
    const result = validateBundle(
      bundle(
        [parsed("glossary", frontMatter("term.owner", { owner: "role." }))],
        { identityEntry },
      ),
      { isRoot: true },
    );

    expect(codes(result)).toContain("invalid_entry");
    expect(codes(result)).toContain("validation.invalid-owner");
  });

  it("rejects revisions of one id that cross semantic domains", () => {
    const result = validateBundle(
      bundle([
        parsed(
          "decision",
          frontMatter("dec.shared", { rev: 1, revisit: "2027-01-01" }),
          "decisions/shared.md",
        ),
        parsed(
          "glossary",
          frontMatter("dec.shared", { rev: 2, status: "draft" }),
          "glossary.md",
        ),
      ]),
      { isRoot: true },
    );

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "kind_mismatch", entryId: "dec.shared" }),
    );
  });

  it("does not resolve a policy route through retired ownership", () => {
    const identityEntry = identity({
      lifecycle: {
        "own.route": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-21",
        },
      },
    });
    const result = validateBundle(
      bundle(
        [
          parsed("ownership", frontMatter("own.route"), "ownership.md", 20),
          parsed(
            "policy",
            frontMatter("policy.route", {
              revisit: "2027-01-01",
              action: "payments.write",
              effect: "escalate",
              route: "own.route",
            }),
            "policies.md",
          ),
        ],
        { identityEntry },
      ),
      { isRoot: true },
    );

    expect(codes(result)).toContain("unresolvable_route");
  });

  it("checks upstream system identity and real calendar dates", () => {
    const result = validateBundle(
      bundle([
        parsed(
          "glossary",
          frontMatter("term.synced", {
            source: "synced:notion",
            revisit: "2026-02-30",
            upstream: {
              system: "confluence",
              ref: "page:1",
              fetched: "2026-02-30",
              digest: "sha256:abc",
            },
          }),
        ),
      ]),
      { isRoot: true },
    );

    expect(codes(result)).toContain("validation.invalid-upstream-system");
    expect(
      codes(result).filter((code) => code === "validation.invalid-date"),
    ).toHaveLength(2);
  });

  it("requires an approved owner of last resort in a root bundle", () => {
    const noLastResort = bundle([]);
    const draftLastResort: Bundle = {
      ...noLastResort,
      entries: noLastResort.entries.map((entry) =>
        entry.frontMatter.id === "own.last-resort"
          ? parsed(
              "ownership",
              frontMatter("own.last-resort", { status: "draft" }),
              "ownership.md",
            )
          : entry,
      ),
    };
    const withoutLastResort: Bundle = {
      ...noLastResort,
      entries: noLastResort.entries.filter(
        ({ frontMatter: values }) => values.id !== "own.last-resort",
      ),
    };
    const retiredIdentity = identity({
      lifecycle: {
        "own.last-resort": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-21",
        },
      },
    });
    const retiredLastResort = bundle([], {
      identityEntry: retiredIdentity,
    });

    expect(codes(validateBundle(draftLastResort, { isRoot: true }))).toContain(
      "validation.missing-last-resort",
    );
    expect(
      codes(validateBundle(withoutLastResort, { isRoot: true })),
    ).toContain("validation.missing-last-resort");
    expect(
      codes(validateBundle(retiredLastResort, { isRoot: true })),
    ).toContain("validation.missing-last-resort");
  });
});
