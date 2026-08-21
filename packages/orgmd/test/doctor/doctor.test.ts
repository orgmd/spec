import { describe, expect, it } from "vitest";
import { doctorBundle, doctorExitCode } from "../../src/doctor/doctor.js";
import type {
  EntryRevision,
  ResolvedContext,
  ValidatedBundle,
} from "../../src/index.js";
import * as publicApi from "../../src/index.js";

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

function bundle(entries: readonly EntryRevision[]): ValidatedBundle {
  return {
    reference: "fixture",
    path: "fixture",
    isRoot: true,
    metadata: { bundle: "org.fixture", lifecycle: {} },
    entries,
  } as unknown as ValidatedBundle;
}

function codes(entries: readonly EntryRevision[], today = "2026-08-21") {
  return doctorBundle({ bundle: bundle(entries), today }).findings.map(
    ({ code }) => code,
  );
}

describe("deterministic bundle doctor", () => {
  it("exposes the doctor API from the package entrypoint", () => {
    expect(publicApi.doctorBundle).toBe(doctorBundle);
    expect(publicApi.doctorExitCode).toBe(doctorExitCode);
  });

  it("distinguishes blocking findings from advisories", () => {
    const report = doctorBundle({
      bundle: bundle([
        entry("own.editor", { domain: "ownership" }),
        entry("term.old", { revisit: "2026-08-20" }),
        entry("term.review", {}),
      ]),
      today: "2026-08-21",
    });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "doctor.overdue-revisit",
          severity: "error",
          blocking: true,
        }),
        expect.objectContaining({
          code: "doctor.revisit-recommended",
          severity: "info",
          blocking: false,
        }),
      ]),
    );
    expect(doctorExitCode(report)).toBe(1);
  });

  it("treats revisit equal to today as not overdue", () => {
    expect(
      codes([entry("term.today", { revisit: "2026-08-21" })]),
    ).not.toContain("doctor.overdue-revisit");
  });

  it("flags mandatory revisit omissions and invalid calendar dates", () => {
    const report = doctorBundle({
      bundle: bundle([
        entry("decision.no-revisit", { domain: "decision" }),
        entry("term.impossible-date", { revisit: "2026-02-30" }),
      ]),
      today: "2026-08-21",
    });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "doctor.missing-revisit",
          entryId: "decision.no-revisit",
          blocking: true,
        }),
        expect.objectContaining({
          code: "doctor.invalid-date",
          entryId: "term.impossible-date",
          blocking: true,
        }),
      ]),
    );
  });

  it("uses effective ownership entries as Core organisational role resolution", () => {
    const report = doctorBundle({
      bundle: bundle([
        entry("own.last-resort", {
          domain: "ownership",
          owner: "role.editor",
        }),
        entry("term.orphan", { owner: "role.missing" }),
      ]),
      today: "2026-08-21",
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "doctor.orphaned-owner",
        entryId: "term.orphan",
        blocking: true,
        details: { fallback: "own.last-resort" },
      }),
    );
    expect(
      report.findings.find(({ entryId }) => entryId === "term.orphan")?.message,
    ).not.toContain("human");
  });

  it("reports pending drafts, synced sources, and metadata-known divergence", () => {
    const report = doctorBundle({
      bundle: bundle([
        entry("own.editor", { domain: "ownership" }),
        entry("term.synced", {
          source: "synced:notion",
          upstream: {
            system: "notion",
            ref: "page-1",
            fetched: "2026-08-20",
            digest: "sha256:approved",
          },
        }),
        entry("term.pending", { rev: 1 }),
        entry("term.pending", {
          rev: 2,
          status: "draft",
          source: "synced:notion",
          upstream: {
            system: "notion",
            ref: "page-2",
            fetched: "2026-08-20",
            digest: "sha256:first",
          },
        }),
        entry("term.pending", {
          rev: 3,
          status: "draft",
          source: "synced:notion",
          upstream: {
            system: "notion",
            ref: "page-2",
            fetched: "2026-08-21",
            digest: "sha256:second",
          },
        }),
      ]),
      today: "2026-08-21",
    });

    expect(report.pendingRevisions).toBe(2);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "doctor.pending-revision" }),
        expect.objectContaining({
          code: "doctor.synced-source",
          blocking: false,
        }),
        expect.objectContaining({
          code: "doctor.upstream-divergence",
          entryId: "term.pending",
          blocking: true,
        }),
      ]),
    );
  });

  it("converts visible resolution errors to blocking findings without exposing withheld ids", () => {
    const context: ResolvedContext = {
      entries: [],
      bundles: [],
      contextId: "ctx",
      diagnostics: [],
      resolutionErrors: [
        {
          code: "kind_mismatch",
          node: "restricted",
          id_withheld: true,
          detail: "An id could not be resolved.",
        },
      ],
    };
    const report = doctorBundle({
      bundle: bundle([entry("own.editor", { domain: "ownership" })]),
      context,
      today: "2026-08-21",
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "doctor.resolution-error",
        blocking: true,
        path: "restricted",
      }),
    );
    const finding = report.findings.find(
      ({ code }) => code === "doctor.resolution-error",
    );
    expect(finding?.entryId).toBeUndefined();
    expect(finding?.message).not.toContain("id could not");
  });
});
