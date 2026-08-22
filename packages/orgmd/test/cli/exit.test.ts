import { describe, expect, it } from "vitest";
import { exitForDiagnostics } from "../../src/cli/exit.js";

describe("CLI diagnostic exit classification", () => {
  it.each([
    "adopt.missing-target",
    "adopt.invalid-target",
    "adopt.source-inside-target",
    "adopt.write-failed",
    "adopt.rollback-failed",
    "adopt.cleanup-failed",
    "cli.discovery-failed",
  ])("classifies operational diagnostic %s as exit 2", (code) => {
    expect(
      exitForDiagnostics([
        { code, severity: "error", message: "operational failure" },
      ]),
    ).toBe(2);
  });

  it("keeps adoption confirmation failures semantic", () => {
    expect(
      exitForDiagnostics([
        {
          code: "adopt.missing-confirmation",
          severity: "error",
          message: "missing confirmation",
        },
      ]),
    ).toBe(1);
  });
});
