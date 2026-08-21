import { describe, expect, it } from "vitest";
import type { EntryRevision, ValidatedBundle } from "../../src/model/types.js";
import { actionContains, effectStrength } from "../../src/resolver/actions.js";
import { resolveContext } from "../../src/resolver/resolve.js";

function definition(
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

function policy(
  id: string,
  action: string,
  effect: EntryRevision["effect"] = "deny",
  overrides: Partial<EntryRevision> = {},
): EntryRevision {
  return definition(id, {
    domain: "policy",
    sourcePath: "policies.md",
    revisit: "2027-01-01",
    action,
    effect,
    ...(effect === "escalate" ? { route: "own.last-resort" } : {}),
    ...overrides,
  });
}

function ownership(
  id = "own.last-resort",
  owner = "role.editor",
): EntryRevision {
  return definition(id, {
    domain: "ownership",
    owner,
    sourcePath: "ownership.md",
  });
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

function resolve(path: readonly ValidatedBundle[]) {
  const result = resolveContext({
    path,
    clearance: ["restricted"],
    today: "2026-08-21",
  });
  if (!result.value) throw new Error("expected effective context");
  return result.value;
}

function ids(context: ReturnType<typeof resolve>) {
  return context.entries.flatMap((entry) =>
    "withheld" in entry ? [] : [entry.revision.id],
  );
}

describe("constraint action containment", () => {
  it.each([
    ["billing.*", "billing.refund", true],
    ["billing.*", "billing.refund.*", true],
    ["billing.refund", "billing.refund", true],
    ["billing.refund", "billing.*", false],
    ["billing.*", "payments.*", false],
    ["billing.refund.*", "billing.refund", false],
  ])("contains %s -> %s = %s", (parent, child, expected) => {
    expect(actionContains(parent, child)).toBe(expected);
  });

  it("orders effects deny above escalate above allow", () => {
    expect([
      effectStrength("allow"),
      effectStrength("escalate"),
      effectStrength("deny"),
    ]).toEqual([0, 1, 2]);
  });
});

describe("constraint resolution", () => {
  it("checks pairwise narrowing across three bundles and retains every contributor", () => {
    const context = resolve([
      bundle("root", [
        ownership(),
        policy("policy.refunds", "billing.*", "allow"),
      ]),
      bundle("division", [
        policy("policy.refunds", "billing.refund.*", "escalate"),
      ]),
      bundle("division/repo", [
        policy("policy.refunds", "billing.refund.issue", "deny"),
      ]),
    ]);

    expect(context.resolutionErrors).toEqual([]);
    expect(ids(context).filter((id) => id === "policy.refunds")).toEqual([
      "policy.refunds",
      "policy.refunds",
      "policy.refunds",
    ]);
  });

  it("allows an escalation route change when the action and effect narrow equally", () => {
    const context = resolve([
      bundle("root", [
        ownership(),
        ownership("own.division", "role.division"),
        policy("policy.refunds", "billing.*", "escalate"),
      ]),
      bundle("division", [
        policy("policy.refunds", "billing.refund", "escalate", {
          route: "own.division",
        }),
      ]),
    ]);

    expect(context.resolutionErrors).toEqual([]);
    expect(ids(context)).toContain("policy.refunds");
  });

  it.each([
    ["billing.refund", "billing.*", "deny", "deny"],
    ["billing.*", "billing.refund", "deny", "allow"],
  ])(
    "fails only the widening id and never falls back",
    (parentAction, childAction, parentEffect, childEffect) => {
      const context = resolve([
        bundle("root", [
          policy(
            "policy.refunds",
            parentAction,
            parentEffect as EntryRevision["effect"],
          ),
          definition("term.unaffected"),
        ]),
        bundle("division", [
          policy(
            "policy.refunds",
            childAction,
            childEffect as EntryRevision["effect"],
          ),
        ]),
      ]);

      expect(context.resolutionErrors).toContainEqual(
        expect.objectContaining({ code: "widening", id: "policy.refunds" }),
      );
      expect(ids(context)).not.toContain("policy.refunds");
      expect(ids(context)).toContain("term.unaffected");
    },
  );

  it("stacks independent policy ids without comparing their strength", () => {
    const context = resolve([
      bundle("root", [policy("policy.freeze", "billing.*", "deny")]),
      bundle("division", [
        policy("policy.guidance", "billing.refund", "allow"),
      ]),
    ]);

    expect(context.resolutionErrors).toEqual([]);
    expect(ids(context)).toEqual(["policy.freeze", "policy.guidance"]);
  });

  it("omits every contributor when one id crosses definition and constraint kinds", () => {
    const context = resolve([
      bundle("root", [definition("rule.shared")]),
      bundle("division", [policy("rule.shared", "billing.*")]),
    ]);

    expect(context.resolutionErrors).toEqual([
      expect.objectContaining({
        code: "kind_mismatch",
        id: "rule.shared",
        conflicts: [
          { bundle: "org.root", id: "rule.shared" },
          { bundle: "org.division", id: "rule.shared" },
        ],
      }),
    ]);
    expect(ids(context)).not.toContain("rule.shared");
  });

  it("reports unknown scopes, invalid actions, and unresolved routes per id", () => {
    const context = resolve([
      bundle("root", [
        ownership(),
        definition("term.unknown", { scope: "secret" }),
        policy("policy.invalid-action", "Billing.*"),
        policy("policy.invalid-route", "billing.refund", "escalate", {
          route: "own.missing",
        }),
        definition("term.unaffected"),
      ]),
    ]);

    expect(
      context.resolutionErrors.map(({ code, id, id_withheld }) => [
        code,
        id,
        id_withheld,
      ]),
    ).toEqual([
      ["unknown_scope", undefined, true],
      ["invalid_action", "policy.invalid-action", undefined],
      ["unresolvable_route", "policy.invalid-route", undefined],
    ]);
    expect(ids(context)).toEqual(["own.last-resort", "term.unaffected"]);
  });

  it("distinguishes missing policy fields from malformed values and unresolved names", () => {
    const context = resolve([
      bundle("root", [
        ownership(),
        policy("policy.missing-action", "billing.refund", "deny", {
          action: undefined,
        }),
        policy("policy.missing-route", "billing.issue", "escalate", {
          route: undefined,
        }),
      ]),
    ]);

    expect(context.resolutionErrors.map(({ code, id }) => [code, id])).toEqual([
      ["invalid_entry", "policy.missing-action"],
      ["invalid_entry", "policy.missing-route"],
    ]);
  });

  it("resolves role routes only through effective authority ownership", () => {
    const context = resolve([
      bundle("root", [
        ownership("own.payments", "role.current"),
        policy("policy.old-role", "billing.old", "escalate", {
          route: "role.old",
        }),
        policy("policy.current-role", "billing.current", "escalate", {
          route: "role.current",
        }),
      ]),
    ]);

    expect(context.resolutionErrors).toContainEqual(
      expect.objectContaining({
        code: "unresolvable_route",
        id: "policy.old-role",
      }),
    );
    expect(ids(context)).toContain("policy.current-role");
    expect(ids(context)).not.toContain("policy.old-role");
  });
});
