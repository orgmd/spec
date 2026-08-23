import { describe, expect, it } from "vitest";
import { sortDiagnostics } from "../../src/diagnostics/sort.js";

describe("sortDiagnostics", () => {
  it("sorts by path, position, entry id, and code without mutating input", () => {
    const input = [
      {
        code: "z",
        severity: "error",
        message: "z",
        path: "b.md",
        line: 1,
        entryId: "term.b",
      },
      {
        code: "b",
        severity: "error",
        message: "b",
        path: "a.md",
        line: 2,
        entryId: "term.a",
      },
      {
        code: "a",
        severity: "warning",
        message: "a",
        path: "a.md",
        line: 2,
        entryId: "term.a",
      },
    ] as const;
    const result = sortDiagnostics(input);
    expect(result.map(({ code }) => code)).toEqual(["a", "b", "z"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(input[0]?.code).toBe("z");
  });

  it("uses message and canonical details as deterministic final tie-breakers", () => {
    const diagnostics = [
      {
        code: "same",
        severity: "warning" as const,
        message: "same message",
        path: "same.md",
        details: { value: "z" },
      },
      {
        code: "same",
        severity: "warning" as const,
        message: "alpha message",
        path: "same.md",
        details: { value: "middle" },
      },
      {
        code: "same",
        severity: "warning" as const,
        message: "same message",
        path: "same.md",
        details: { value: "a" },
      },
    ];
    const expected = ["middle", "a", "z"];

    for (const permutation of [diagnostics, [...diagnostics].reverse()]) {
      expect(
        sortDiagnostics(permutation).map(({ details }) => details?.value),
      ).toEqual(expected);
    }
  });
});
