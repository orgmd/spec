import { describe, expect, it } from "vitest";
import {
  computeBundleDigestInput,
  computeContentId,
  IdentifierError,
  metadataDigest,
} from "../../src/identifiers/content-id.js";
import type {
  Bundle,
  ParsedEntryRevision,
  ValidatedBundle,
} from "../../src/model/types.js";
import { validateBundle } from "../../src/validation/validate.js";

const parsed = (
  domain: string,
  id: string,
  overrides: Readonly<Record<string, unknown>> = {},
): ParsedEntryRevision => ({
  frontMatter: {
    id,
    owner: "role.editor",
    scope: "public",
    status: "approved",
    source: "native",
    rev: 1,
    ...overrides,
  },
  body: `Body for ${id}`,
  domain,
  sourcePath: `${domain}.md`,
  line: 1,
});

function validated(
  entries: readonly ParsedEntryRevision[] = [],
  identityOverrides: Readonly<Record<string, unknown>> = {},
): ValidatedBundle {
  const identity = parsed("identity", "org.identity", {
    bundle: "example.root",
    ...identityOverrides,
  });
  const input: Bundle = {
    reference: "fixture",
    path: "/fixture",
    isRoot: true,
    identityMetadata: identity.frontMatter,
    entries: [identity, parsed("ownership", "own.last-resort"), ...entries],
  };
  const result = validateBundle(input, { isRoot: true });
  expect(result.diagnostics).toEqual([]);
  if (!result.value) throw new Error("test fixture did not validate");
  return result.value;
}

describe("Core bundle content identifiers", () => {
  it("hashes the always-present empty metadata object and line", () => {
    expect(metadataDigest({})).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
    expect(computeBundleDigestInput([], {})).toBe(
      "sha256:6c2c9d2bf3a99293400f9ce8aa3086d5fed29c714408034290a5d14dcb96abc1",
    );
  });

  it("hashes every revision and is independent of input enumeration order", () => {
    const approved = parsed("glossary", "term.freight", { rev: 1 });
    const draft = parsed("glossary", "term.freight", {
      rev: 2,
      status: "draft",
    });
    const rejected = parsed("glossary", "term.freight", {
      rev: 10,
      status: "rejected",
    });

    const forward = computeContentId(validated([approved, draft, rejected]));
    const reordered = computeContentId(validated([rejected, approved, draft]));
    const changedDraft = {
      ...draft,
      body: "Changed unratified meaning",
    };

    expect(reordered).toBe(forward);
    expect(
      computeContentId(validated([approved, changedDraft, rejected])),
    ).not.toBe(forward);
  });

  it("changes when only bundle metadata changes", () => {
    expect(computeContentId(validated([], { bundle: "example.one" }))).not.toBe(
      computeContentId(validated([], { bundle: "example.two" })),
    );
  });

  it("ignores unknown nested upstream fields", () => {
    const upstream = {
      system: "registry",
      ref: "terms/freight",
      fetched: "2026-08-21",
      digest: "sha256:abc",
    };
    const withoutExtension = parsed("glossary", "term.freight", {
      source: "synced:registry",
      upstream,
    });
    const withExtension = parsed("glossary", "term.freight", {
      source: "synced:registry",
      upstream: { ...upstream, note: "unknown nested metadata" },
    });

    expect(computeContentId(validated([withExtension]))).toBe(
      computeContentId(validated([withoutExtension])),
    );
  });

  it("rejects duplicate (id, rev) records with a stable public diagnostic", () => {
    const bundle = validated([parsed("glossary", "term.freight")]);
    const duplicate = {
      ...bundle,
      entries: [...bundle.entries, bundle.entries.at(-1)!],
    } as unknown as ValidatedBundle;

    expect(() => computeContentId(duplicate)).toThrowError(
      expect.objectContaining({
        name: "IdentifierError",
        diagnostic: expect.objectContaining({
          code: "identifier.duplicate-revision",
          entryId: "term.freight",
        }),
      }) as IdentifierError,
    );
  });

  it("wraps JCS failures in a stable public diagnostic", () => {
    const bundle = validated();
    const malformed = {
      ...bundle,
      entries: [
        {
          ...bundle.entries[0]!,
          body: "\ud800",
        },
        ...bundle.entries.slice(1),
      ],
    } as unknown as ValidatedBundle;

    expect(() => computeContentId(malformed)).toThrowError(
      expect.objectContaining({
        name: "IdentifierError",
        diagnostic: expect.objectContaining({
          code: "identifier.canonicalization-failed",
        }),
      }) as IdentifierError,
    );
  });
});
