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
});
