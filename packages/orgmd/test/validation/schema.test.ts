import { describe, expect, it } from "vitest";
import { validateEntrySchema } from "../../src/validation/schema.js";

const baseEntry = (
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> => ({
  id: "policy.payment-review",
  owner: "role.editor",
  scope: "public",
  status: "approved",
  source: "native",
  rev: 1,
  ...overrides,
});

describe("entry schema", () => {
  it.each(["draft", "approved", "rejected"])("accepts status %s", (status) => {
    expect(validateEntrySchema(baseEntry({ status }))).toEqual([]);
  });

  it.each(["contested", "superseded", "stale"])(
    "rejects legacy status %s",
    (status) => {
      expect(validateEntrySchema(baseEntry({ status }))).toContainEqual(
        expect.objectContaining({ code: "invalid_entry" }),
      );
    },
  );

  it("requires all common fields and an integer revision", () => {
    const { owner: _owner, ...withoutOwner } = baseEntry();

    expect(validateEntrySchema(withoutOwner)).toContainEqual(
      expect.objectContaining({ code: "invalid_entry" }),
    );
    expect(validateEntrySchema(baseEntry({ rev: 1.5 }))).toContainEqual(
      expect.objectContaining({ code: "invalid_entry" }),
    );
  });

  it.each([
    "term.consignment",
    "policy.P-03",
    "dec.0001",
    "a_b.c-2",
    "Zed.value",
  ])("accepts conforming id %s", (id) => {
    expect(validateEntrySchema(baseEntry({ id }))).toEqual([]);
  });

  it.each(["", ".term", "term.", "1term.value", "term/one", "térm.one"])(
    "rejects malformed id %s",
    (id) => {
      expect(validateEntrySchema(baseEntry({ id }))).toContainEqual(
        expect.objectContaining({ code: "invalid_entry" }),
      );
    },
  );

  it.each(["native", "synced:notion", "synced:google-drive", "synced:Notion"])(
    "accepts conforming source %s",
    (source) => {
      const upstream = source.startsWith("synced:")
        ? {
            system: source.slice("synced:".length),
            ref: "page:123",
            fetched: "2026-08-21",
            digest: "sha256:abc",
          }
        : undefined;
      expect(validateEntrySchema(baseEntry({ source, upstream }))).toEqual([]);
    },
  );

  it.each(["synced:", "synced:two:systems", "synced:has space", "manual"])(
    "rejects malformed source %s",
    (source) => {
      expect(validateEntrySchema(baseEntry({ source }))).toContainEqual(
        expect.objectContaining({ code: "invalid_entry" }),
      );
    },
  );

  it("requires complete upstream metadata for synced sources", () => {
    expect(
      validateEntrySchema(baseEntry({ source: "synced:notion" })),
    ).toContainEqual(
      expect.objectContaining({ code: "validation.missing-upstream" }),
    );
    expect(
      validateEntrySchema(
        baseEntry({
          source: "synced:notion",
          upstream: {
            system: "notion",
            ref: "page:123",
            fetched: "2026-08-21",
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({ code: "validation.missing-upstream" }),
    );
  });

  it.each([
    "billing.refund",
    "billing.refund.high-value",
    "billing.*",
    "edit_spec_normative",
  ])("accepts conforming action %s", (action) => {
    expect(validateEntrySchema(baseEntry({ action }))).toEqual([]);
  });

  it.each(["*", "bill*.read", "a.*.b", "Billing.read", "billing."])(
    "rejects malformed action %s",
    (action) => {
      expect(validateEntrySchema(baseEntry({ action }))).toContainEqual(
        expect.objectContaining({ code: "invalid_action" }),
      );
    },
  );

  it.each(["allow", "escalate", "deny"])("accepts effect %s", (effect) => {
    const route = effect === "escalate" ? "own.spec" : undefined;
    expect(validateEntrySchema(baseEntry({ effect, route }))).toEqual([]);
  });

  it("rejects invalid effects and an escalation without a route", () => {
    expect(validateEntrySchema(baseEntry({ effect: "warn" }))).toContainEqual(
      expect.objectContaining({ code: "invalid_entry" }),
    );
    expect(
      validateEntrySchema(baseEntry({ effect: "escalate" })),
    ).toContainEqual(expect.objectContaining({ code: "invalid_entry" }));
  });

  it("permits unknown front-matter keys", () => {
    expect(
      validateEntrySchema(baseEntry({ extension: { vendor: true } })),
    ).toEqual([]);
  });
});
