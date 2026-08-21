import { describe, expect, it } from "vitest";
import {
  bundleMetadataCanonicalForm,
  entryCanonicalForm,
  normalizeBody,
} from "../../src/identifiers/canonical.js";
import type { BundleMetadata, EntryRevision } from "../../src/model/types.js";

describe("identifier canonical forms", () => {
  it("normalizes line endings, Unicode, trailing whitespace, and boundary blank lines only", () => {
    expect(normalizeBody("\r\n  cafe\u0301  \r\ninside  \t\r\n\r\n")).toBe(
      "  café\ninside",
    );
  });

  it("includes only normative entry members", () => {
    const revision: EntryRevision = {
      id: "policy.export",
      owner: "role.editor",
      scope: "restricted",
      status: "approved",
      source: "synced:governance",
      rev: 2,
      domain: "policy",
      body: "Keep this  \r\n",
      sourcePath: "policies.md",
      line: 42,
      revisit: "2027-01-01",
      ref: "records/export",
      upstream: {
        system: "governance",
        ref: "policy/17",
        fetched: "2026-08-21",
        digest: "sha256:abc",
        note: "unknown nested metadata",
      },
      action: "data.export",
      effect: "escalate",
      route: "own.security",
      delegates: ["division.nz", "team.claims"],
      extra: {
        extension: "ignored",
        bundle: "ignored",
        lifecycle: { "policy.export": { state: "retired" } },
      },
    };

    expect(entryCanonicalForm(revision)).toEqual({
      id: "policy.export",
      owner: "role.editor",
      scope: "restricted",
      status: "approved",
      source: "synced:governance",
      domain: "policy",
      rev: 2,
      revisit: "2027-01-01",
      ref: "records/export",
      upstream: {
        system: "governance",
        ref: "policy/17",
        fetched: "2026-08-21",
        digest: "sha256:abc",
      },
      action: "data.export",
      effect: "escalate",
      route: "own.security",
      delegates: ["division.nz", "team.claims"],
      body: "Keep this",
    });
  });

  it("sorts and de-duplicates scope edges and strips lifecycle provenance", () => {
    const metadata: BundleMetadata = {
      bundle: "example.root",
      scopes: {
        zeta: { narrower_than: ["public", "internal", "public"] },
        alpha: { narrower_than: ["zeta"] },
      },
      graceDays: 30,
      lifecycle: {
        "term.zeta": {
          state: "retired",
          by: "role.editor",
          date: "2026-08-21",
          ref: "records/retirement",
        },
        "term.alpha": {
          state: "contested",
          by: "role.owner",
          date: "2026-08-20",
          ref: "records/dispute",
        },
      },
    };

    expect(bundleMetadataCanonicalForm(metadata)).toEqual({
      bundle: "example.root",
      scopes: {
        alpha: ["zeta"],
        zeta: ["internal", "public"],
      },
      grace_days: 30,
      lifecycle: [
        { id: "term.alpha", state: "contested" },
        { id: "term.zeta", state: "retired" },
      ],
    });
  });

  it("keeps the always-present empty metadata object", () => {
    expect(bundleMetadataCanonicalForm({ lifecycle: {} })).toEqual({});
  });
});
